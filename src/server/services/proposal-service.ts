/**
 * Negociação e contratação (§13, §14, §17, §18, §19).
 *
 * O aceite é o ponto em que a conversa vira dinheiro: cria a Order, resolve a
 * regra de comissão vigente e congela o snapshot. Tudo numa única transação —
 * ou existe ordem com snapshot, ou não existe ordem.
 */

import { DomainError } from "@/domain/shared/errors";
import { money } from "@/domain/shared/money";
import {
  buildCommissionSnapshot,
  calculateCommission,
  resolveCommissionRule,
  type CommissionRuleData,
} from "@/domain/financial/commission";
import { proposalMachine, serviceRequestMachine } from "@/domain/state-machines";
import { prisma } from "@/server/db/prisma";
import { emitEvent } from "@/server/events";
import { logger } from "@/server/observability/logger";
import { registrarEvento } from "@/server/services/analytics-service";
import { recordConversationEvent } from "@/server/services/message-service";
import type { Prisma } from "@/generated/prisma/client";

/** Valor em reais para o texto das mensagens automáticas do chat. */
function reais(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export interface CreateProposalInput {
  requestId: string;
  providerId: string;
  author: "CLIENTE" | "PRESTADOR";
  amountCents: number;
  message?: string;
  estimatedDurationMinutes?: number;
}

/**
 * Cria proposta ou contraproposta. Cada uma guarda autor, valor, timestamp,
 * status e versão (§14), encadeada à anterior para preservar o histórico.
 */
export async function createProposal(
  input: CreateProposalInput,
  correlationId: string,
) {
  if (input.amountCents <= 0) {
    throw new DomainError("PROPOSAL_INVALID_AMOUNT", "Valor da proposta deve ser positivo");
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUniqueOrThrow({
      where: { id: input.requestId },
    });
    if (request.status !== "ABERTA" && request.status !== "EM_NEGOCIACAO") {
      throw new DomainError(
        "REQUEST_NOT_NEGOTIABLE",
        `Solicitação em ${request.status} não aceita propostas`,
      );
    }

    const previous = await tx.proposal.findFirst({
      where: { requestId: input.requestId, providerId: input.providerId },
      orderBy: { version: "desc" },
    });

    if (previous) {
      if (previous.status === "ACEITA") {
        throw new DomainError(
          "PROPOSAL_ALREADY_ACCEPTED",
          "Valor já aceito. Alterações exigem fluxo formal.",
        );
      }
      if (previous.author === input.author) {
        throw new DomainError(
          "PROPOSAL_OUT_OF_TURN",
          "Aguarde a resposta da outra parte antes de propor novamente",
        );
      }
      // A anterior passa a CONTRAPROPOSTA — validado pela máquina de estado.
      proposalMachine.transition(previous.status, "CONTRAPROPOSTA");
      await tx.proposal.update({
        where: { id: previous.id },
        data: { status: "CONTRAPROPOSTA" },
      });
    }

    const proposal = await tx.proposal.create({
      data: {
        requestId: input.requestId,
        providerId: input.providerId,
        author: input.author,
        amountCents: input.amountCents,
        message: input.message,
        estimatedDurationMinutes: input.estimatedDurationMinutes,
        version: (previous?.version ?? 0) + 1,
        previousProposalId: previous?.id,
        status: "ENVIADA",
      },
    });

    if (request.status === "ABERTA") {
      serviceRequestMachine.transition(request.status, "EM_NEGOCIACAO");
      await tx.serviceRequest.update({
        where: { id: request.id },
        data: { status: "EM_NEGOCIACAO" },
      });
    }

    // A conversa nasce com a primeira proposta e recebe cada rodada (§15).
    await recordConversationEvent(
      tx,
      {
        requestId: input.requestId,
        customerId: request.customerId,
        providerId: input.providerId,
      },
      {
        type: previous ? "COUNTER_PROPOSAL" : "PROPOSAL",
        content: input.message?.trim()
          ? `${reais(input.amountCents)} — ${input.message.trim()}`
          : reais(input.amountCents),
        metadata: {
          amountCents: input.amountCents,
          author: input.author,
          version: proposal.version,
        },
      },
    );

    await emitEvent(tx, {
      type: proposal.version === 1 ? "proposal.created" : "proposal.countered",
      idempotencyKey: `proposal.v${proposal.version}:${proposal.id}`,
      correlationId,
      data: {
        negotiation_id: input.requestId,
        proposal_id: proposal.id,
        provider_id: input.providerId,
        author: input.author,
        amount_cents: input.amountCents,
        version: proposal.version,
        status: "AGUARDANDO_RESPOSTA",
      },
    });

    logger.info("Proposta registrada", {
      correlationId,
      proposalId: proposal.id,
      version: proposal.version,
      amountCents: proposal.amountCents,
    });

    return proposal;
  });
}

function toRuleData(rule: {
  id: string;
  name: string;
  scope: string;
  percentBps: number;
  fixedFeeCents: number;
  minCommissionCents: number | null;
  maxCommissionCents: number | null;
  providerId: string | null;
  categoryId: string | null;
  cityId: string | null;
  planCode: string | null;
  campaignCode: string | null;
  priority: number;
  version: number;
  active: boolean;
  validFrom: Date;
  validTo: Date | null;
}): CommissionRuleData {
  return { ...rule, scope: rule.scope as CommissionRuleData["scope"] };
}

/** Referência legível para suporte: AF-2026-000123 */
async function nextOrderReference(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await tx.marketplaceOrder.count();
  return `AF-${year}-${String(count + 1).padStart(6, "0")}`;
}

/**
 * Aceite da proposta → Order + snapshot financeiro congelado.
 *
 * A partir daqui o valor contratado não muda informalmente (§14): a ordem
 * carrega a própria verdade financeira, imune a alterações posteriores da
 * regra de comissão (§19).
 */
export async function acceptProposal(
  proposalId: string,
  acceptedByRole: "CLIENTE" | "PRESTADOR",
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: {
        request: { include: { address: true, customer: true } },
        provider: true,
      },
    });

    // Quem propôs não aceita a própria proposta.
    if (proposal.author === acceptedByRole) {
      throw new DomainError(
        "CANNOT_ACCEPT_OWN_PROPOSAL",
        "O aceite cabe à outra parte da negociação",
      );
    }
    proposalMachine.transition(proposal.status, "ACEITA");

    const existingOrder = await tx.marketplaceOrder.findUnique({
      where: { requestId: proposal.requestId },
    });
    if (existingOrder) {
      throw new DomainError(
        "ORDER_ALREADY_EXISTS",
        "Esta solicitação já gerou uma ordem",
      );
    }

    // Resolve a regra vigente NESTE instante (§20)
    const now = new Date();
    const rules = await tx.commissionRule.findMany({ where: { active: true } });
    const rule = resolveCommissionRule(rules.map(toRuleData), {
      providerId: proposal.providerId,
      categoryId: proposal.request.categoryId,
      cityId: proposal.provider.cityId,
      planCode: null,
      campaignCodes: [],
      at: now,
    });
    if (!rule) {
      throw new DomainError(
        "NO_COMMISSION_RULE",
        "Nenhuma regra de comissão aplicável. Configure ao menos a regra global.",
      );
    }

    const commission = calculateCommission(rule, money(proposal.amountCents));
    const snapshot = buildCommissionSnapshot(commission);

    const order = await tx.marketplaceOrder.create({
      data: {
        reference: await nextOrderReference(tx),
        customerId: proposal.request.customerId,
        providerId: proposal.providerId,
        requestId: proposal.requestId,
        proposalId: proposal.id,
        status: "AGUARDANDO_PAGAMENTO",
        grossAmountCents: commission.grossAmount.amountCents,
        commissionAmountCents: commission.commissionAmount.amountCents,
        providerNetAmountCents: commission.providerNetAmount.amountCents,
        snapshot: {
          create: {
            ruleId: snapshot.ruleId,
            ruleScope: snapshot.ruleScope,
            ruleVersion: snapshot.ruleVersion,
            ruleName: snapshot.ruleName,
            grossAmountCents: snapshot.grossAmountCents,
            percentBps: snapshot.percentBps,
            fixedFeeCents: snapshot.fixedFeeCents,
            minCommissionCents: snapshot.minCommissionCents,
            maxCommissionCents: snapshot.maxCommissionCents,
            discountCents: snapshot.discountCents,
            commissionAmountCents: snapshot.commissionAmountCents,
            providerNetAmountCents: snapshot.providerNetAmountCents,
            currency: snapshot.currency,
            ruleSnapshot: snapshot.ruleSnapshot as Prisma.InputJsonValue,
          },
        },
      },
      include: { snapshot: true },
    });

    await tx.proposal.update({
      where: { id: proposal.id },
      data: { status: "ACEITA", acceptedAt: now },
    });
    await tx.serviceRequest.update({
      where: { id: proposal.requestId },
      data: { status: "CONTRATADA" },
    });

    await tx.auditLog.create({
      data: {
        action: "PROPOSAL_ACCEPTED",
        entityType: "MarketplaceOrder",
        entityId: order.id,
        newValue: {
          grossAmountCents: order.grossAmountCents,
          commissionAmountCents: order.commissionAmountCents,
          providerNetAmountCents: order.providerNetAmountCents,
          ruleId: snapshot.ruleId,
          ruleVersion: snapshot.ruleVersion,
        },
        correlationId,
      },
    });

    await recordConversationEvent(
      tx,
      {
        requestId: proposal.requestId,
        customerId: proposal.request.customerId,
        providerId: proposal.providerId,
      },
      {
        type: "VALUE_ACCEPTED",
        content: `Valor acordado: ${reais(proposal.amountCents)}. Pedido ${order.reference} criado — o pagamento fica retido até a conclusão do serviço.`,
        metadata: {
          amountCents: proposal.amountCents,
          orderId: order.id,
          reference: order.reference,
          acceptedBy: acceptedByRole,
        },
      },
    );

    // Eventos para o n8n: aceite fecha a negociação e pede a cobrança (§17)
    await emitEvent(tx, {
      type: "proposal.accepted",
      idempotencyKey: `proposal.accepted:${proposal.id}`,
      correlationId,
      data: {
        negotiation_id: proposal.requestId,
        proposal_id: proposal.id,
        order_id: order.id,
        provider_id: proposal.providerId,
        amount_cents: proposal.amountCents,
        accepted_by: acceptedByRole,
      },
    });
    await emitEvent(tx, {
      type: "negotiation.completed",
      idempotencyKey: `negotiation.completed:${proposal.requestId}`,
      correlationId,
      data: { negotiation_id: proposal.requestId, order_id: order.id },
    });
    await emitEvent(tx, {
      type: "payment.requested",
      idempotencyKey: `payment.requested:${order.id}`,
      correlationId,
      data: {
        order_id: order.id,
        reference: order.reference,
        gross_amount_cents: order.grossAmountCents,
        currency: order.currency,
        status: "AGUARDANDO_PAGAMENTO",
      },
    });

    // Marco do funil (§60): a negociação virou contrato.
    await registrarEvento(tx, {
      nome: "aceitou_proposta",
      propriedades: {
        orderId: order.id,
        requestId: proposal.requestId,
        grossAmountCents: order.grossAmountCents,
      },
    });

    logger.info("Ordem criada a partir do aceite", {
      correlationId,
      orderId: order.id,
      reference: order.reference,
      grossAmountCents: order.grossAmountCents,
      commissionAmountCents: order.commissionAmountCents,
      ruleId: snapshot.ruleId,
      ruleVersion: snapshot.ruleVersion,
    });

    return order;
  });
}

/**
 * Recusa da proposta (§14). A solicitação volta a ABERTA para que outros
 * profissionais ainda possam propor.
 */
export async function rejectProposal(
  proposalId: string,
  rejectedByRole: "CLIENTE" | "PRESTADOR",
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: { request: true },
    });
    if (proposal.author === rejectedByRole) {
      throw new DomainError(
        "CANNOT_REJECT_OWN_PROPOSAL",
        "A recusa cabe à outra parte da negociação",
      );
    }
    proposalMachine.transition(proposal.status, "RECUSADA");

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "RECUSADA" },
    });
    if (proposal.request.status === "EM_NEGOCIACAO") {
      serviceRequestMachine.transition(proposal.request.status, "ABERTA");
      await tx.serviceRequest.update({
        where: { id: proposal.requestId },
        data: { status: "ABERTA" },
      });
    }

    await emitEvent(tx, {
      type: "proposal.rejected",
      idempotencyKey: `proposal.rejected:${proposalId}`,
      correlationId,
      data: {
        negotiation_id: proposal.requestId,
        proposal_id: proposalId,
        provider_id: proposal.providerId,
        rejected_by: rejectedByRole,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "PROPOSAL_REJECTED",
        entityType: "Proposal",
        entityId: proposalId,
        newValue: { rejectedBy: rejectedByRole },
        correlationId,
      },
    });

    logger.info("Proposta recusada", { correlationId, proposalId });
    return tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  });
}
