/**
 * Disputas (§33) — abertura bloqueia o repasse automaticamente; nenhuma
 * resolução acontece fora do back-end.
 */

import { DomainError } from "@/domain/shared/errors";
import {
  blockForDispute,
  forfeitBlocked,
  unblockToAvailable,
} from "@/domain/financial/balance";
import { disputeMachine, orderMachine } from "@/domain/state-machines";
import { prisma } from "@/server/db/prisma";
import { emitEvent } from "@/server/events";
import {
  lockProviderBalance,
  saveProviderBalance,
} from "@/server/ledger/repository";
import { logger } from "@/server/observability/logger";

export interface OpenDisputeInput {
  orderId: string;
  /** Quando vem da UI, valida a propriedade; via n8n/admin pode ser omitido. */
  customerId?: string;
  reason:
    | "TECNICO_NAO_COMPARECEU"
    | "SERVICO_INCOMPLETO"
    | "EQUIPAMENTO_DANIFICADO"
    | "COBRANCA_DIVERGENTE"
    | "PROBLEMA_QUALIDADE"
    | "CANCELAMENTO"
    | "OUTRO";
  description: string;
}

export async function openDispute(input: OpenDisputeInput, correlationId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findUniqueOrThrow({
      where: { id: input.orderId },
      include: { disputes: true },
    });
    if (input.customerId && order.customerId !== input.customerId) {
      throw new DomainError("DISPUTE_NOT_OWNED", "Ordem não pertence a este cliente");
    }
    const aberta = order.disputes.find(
      (d) => !d.status.startsWith("RESOLVIDA") && d.status !== "CANCELADA",
    );
    if (aberta) {
      throw new DomainError("DISPUTE_ALREADY_OPEN", "Já existe disputa aberta");
    }

    // Válido a partir do pagamento; a máquina recusa o resto (ex.: ESTORNADA)
    orderMachine.transition(order.status, "EM_DISPUTA");
    const jaLiquidada = order.status === "LIQUIDADA";

    // Se o líquido já foi creditado ao prestador, bloqueia o valor (§33)
    if (jaLiquidada) {
      const balance = await lockProviderBalance(tx, order.providerId);
      await saveProviderBalance(
        tx,
        order.providerId,
        blockForDispute(balance, order.providerNetAmountCents),
      );
    }

    const dispute = await tx.dispute.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        providerId: order.providerId,
        status: "ABERTA",
        reason: input.reason,
        description: input.description,
        blockedAmountCents: jaLiquidada ? order.providerNetAmountCents : 0,
      },
    });
    await tx.marketplaceOrder.update({
      where: { id: order.id },
      data: { status: "EM_DISPUTA" },
    });

    await emitEvent(tx, {
      type: "dispute.created",
      idempotencyKey: `dispute.created:${dispute.id}`,
      correlationId,
      data: {
        dispute_id: dispute.id,
        order_id: order.id,
        reason: input.reason,
        blocked_amount_cents: dispute.blockedAmountCents,
        status: "DISPUTA_ABERTA",
      },
    });
    await tx.auditLog.create({
      data: {
        action: "DISPUTE_OPENED",
        entityType: "Dispute",
        entityId: dispute.id,
        previousValue: { orderStatus: order.status },
        newValue: { reason: input.reason, blockedAmountCents: dispute.blockedAmountCents },
        correlationId,
      },
    });

    logger.info("Disputa aberta — repasse bloqueado", {
      correlationId,
      orderId: order.id,
      disputeId: dispute.id,
    });
    return dispute;
  });
}

export type DisputeResolution =
  | "LIBERAR_REPASSE_INTEGRAL"
  | "REEMBOLSO_INTEGRAL"
  | "REEMBOLSO_PARCIAL";

/**
 * Resolução administrativa. Movimenta o saldo bloqueado conforme a decisão;
 * o reembolso ao cliente é registrado como Refund e executado pelo fluxo de
 * estorno existente (nunca apagando lançamentos).
 */
export async function resolveDispute(
  input: {
    disputeId: string;
    resolution: DisputeResolution;
    refundAmountCents?: number;
    resolvedBy: string;
    resolutionNotes?: string;
  },
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUniqueOrThrow({
      where: { id: input.disputeId },
      include: { order: { include: { payments: { where: { status: "PAID" }, take: 1 } } } },
    });
    // ABERTA → EM_ANALISE → RESOLVIDA_*: o passo intermediário registra análise
    let status = disputeMachine.transition(dispute.status, "EM_ANALISE");

    const bloqueado = dispute.blockedAmountCents;
    let novoStatusOrdem: "LIQUIDADA" | "ESTORNADA" = "LIQUIDADA";
    let refundCents = 0;

    switch (input.resolution) {
      case "LIBERAR_REPASSE_INTEGRAL": {
        status = disputeMachine.transition(status, "RESOLVIDA_PRESTADOR");
        if (bloqueado > 0) {
          const balance = await lockProviderBalance(tx, dispute.providerId);
          await saveProviderBalance(
            tx,
            dispute.providerId,
            unblockToAvailable(balance, bloqueado),
          );
        }
        break;
      }
      case "REEMBOLSO_INTEGRAL": {
        status = disputeMachine.transition(status, "RESOLVIDA_CLIENTE");
        refundCents = dispute.order.grossAmountCents;
        novoStatusOrdem = "ESTORNADA";
        if (bloqueado > 0) {
          const balance = await lockProviderBalance(tx, dispute.providerId);
          await saveProviderBalance(
            tx,
            dispute.providerId,
            forfeitBlocked(balance, bloqueado),
          );
        }
        break;
      }
      case "REEMBOLSO_PARCIAL": {
        status = disputeMachine.transition(status, "RESOLVIDA_PARCIAL");
        refundCents = input.refundAmountCents ?? 0;
        if (refundCents <= 0 || refundCents >= dispute.order.grossAmountCents) {
          throw new DomainError(
            "DISPUTE_INVALID_PARTIAL",
            "Reembolso parcial deve ser maior que zero e menor que o bruto",
          );
        }
        if (bloqueado > 0) {
          const balance = await lockProviderBalance(tx, dispute.providerId);
          const forfeit = Math.min(bloqueado, refundCents);
          let next = forfeitBlocked(balance, forfeit);
          if (bloqueado - forfeit > 0) {
            next = unblockToAvailable(next, bloqueado - forfeit);
          }
          await saveProviderBalance(tx, dispute.providerId, next);
        }
        break;
      }
    }

    if (refundCents > 0 && dispute.order.payments[0]) {
      await tx.refund.create({
        data: {
          orderId: dispute.orderId,
          paymentId: dispute.order.payments[0].id,
          type: refundCents === dispute.order.grossAmountCents ? "TOTAL" : "PARCIAL",
          status: "SOLICITADO",
          amountCents: refundCents,
          reason: `Resolução de disputa ${dispute.id}`,
          requestedBy: input.resolvedBy,
          idempotencyKey: `dispute-refund:${dispute.id}`,
        },
      });
    }

    orderMachine.transition("EM_DISPUTA", novoStatusOrdem);
    await tx.marketplaceOrder.update({
      where: { id: dispute.orderId },
      data: { status: novoStatusOrdem },
    });
    const updated = await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status,
        resolution: input.resolutionNotes ?? input.resolution,
        refundAmountCents: refundCents || null,
        resolvedBy: input.resolvedBy,
        resolvedAt: new Date(),
      },
    });

    await emitEvent(tx, {
      type: "dispute.resolved",
      idempotencyKey: `dispute.resolved:${dispute.id}`,
      correlationId,
      data: {
        dispute_id: dispute.id,
        order_id: dispute.orderId,
        resolution: input.resolution,
        refund_amount_cents: refundCents,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: undefined,
        action: "DISPUTE_RESOLVED",
        entityType: "Dispute",
        entityId: dispute.id,
        previousValue: { status: dispute.status },
        newValue: { status, resolution: input.resolution, refundCents },
        reason: input.resolutionNotes,
        correlationId,
      },
    });

    logger.info("Disputa resolvida", {
      correlationId,
      disputeId: dispute.id,
      resolution: input.resolution,
    });
    return updated;
  });
}
