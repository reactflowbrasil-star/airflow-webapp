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
import { logger } from "@/server/observability/logger";
import type { Prisma } from "@/generated/prisma/client";

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
