/**
 * Agendamento, execução e liquidação (§29, §34, §35).
 *
 * A liberação do saldo é a operação mais sensível do sistema: só acontece
 * depois de serviço concluído, janela de segurança vencida e ausência de
 * disputa. Nada disso é decidido pelo frontend.
 */

import { DomainError } from "@/domain/shared/errors";
import { serviceSettlementTransaction } from "@/domain/financial/ledger";
import {
  creditPending,
  releasePendingToAvailable,
} from "@/domain/financial/balance";
import { appointmentMachine, orderMachine } from "@/domain/state-machines";
import { prisma } from "@/server/db/prisma";
import {
  lockProviderBalance,
  postTransaction,
  saveProviderBalance,
} from "@/server/ledger/repository";
import { logger } from "@/server/observability/logger";

/**
 * Agenda o serviço. Exige ordem paga: serviço só é autorizado depois que o
 * dinheiro entrou (§17).
 */
export async function scheduleService(
  orderId: string,
  scheduledAt: Date,
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });

    if (order.status !== "PAGA") {
      throw new DomainError(
        "ORDER_NOT_PAID",
        `Ordem em ${order.status} não pode ser agendada antes do pagamento confirmado`,
      );
    }
    orderMachine.transition(order.status, "AUTORIZADA");

    const appointment = await tx.appointment.create({
      data: {
        orderId: order.id,
        providerId: order.providerId,
        scheduledAt,
        status: "CONFIRMADO",
        confirmedAt: new Date(),
      },
    });

    await tx.marketplaceOrder.update({
      where: { id: order.id },
      data: { status: "AUTORIZADA" },
    });

    logger.info("Serviço agendado", {
      correlationId,
      orderId: order.id,
      appointmentId: appointment.id,
      scheduledAt: scheduledAt.toISOString(),
    });

    return appointment;
  });
}

/** Técnico a caminho → em andamento (§35). */
export async function startService(orderId: string, correlationId: string) {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({ where: { orderId } });
    const order = await tx.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });

    appointmentMachine.transition(appointment.status, "A_CAMINHO");
    const enRoute = await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "A_CAMINHO", enRouteAt: new Date() },
    });

    appointmentMachine.transition(enRoute.status, "EM_ANDAMENTO");
    const started = await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "EM_ANDAMENTO", startedAt: new Date() },
    });

    orderMachine.transition(order.status, "EM_EXECUCAO");
    await tx.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: "EM_EXECUCAO" },
    });

    logger.info("Serviço iniciado", { correlationId, orderId });
    return started;
  });
}

/**
 * Conclusão do serviço. Marca o início da janela de segurança — o dinheiro
 * ainda NÃO é do prestador neste momento.
 */
export async function completeService(orderId: string, correlationId: string) {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({ where: { orderId } });
    const order = await tx.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });

    appointmentMachine.transition(appointment.status, "CONCLUIDO");
    orderMachine.transition(order.status, "CONCLUIDA");

    const completedAt = new Date();
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "CONCLUIDO", completedAt },
    });
    const updated = await tx.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: "CONCLUIDA", completedAt },
    });

    logger.info("Serviço concluído — janela de segurança iniciada", {
      correlationId,
      orderId,
      securityWindowHours: updated.securityWindowHours,
    });

    return updated;
  });
}

/**
 * Liquidação (§17, §29): reconhece a comissão, credita o líquido ao prestador
 * como PENDENTE e leva a ordem a LIQUIDADA.
 *
 * Idempotente pela chave `settlement:<orderId>` — rodar o job duas vezes não
 * credita duas vezes.
 */
export async function settleOrder(orderId: string, correlationId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { snapshot: true, disputes: true },
    });

    if (order.status !== "CONCLUIDA") {
      throw new DomainError(
        "ORDER_NOT_COMPLETED",
        `Ordem em ${order.status} não pode ser liquidada`,
      );
    }
    const openDispute = order.disputes.find(
      (d) => !d.status.startsWith("RESOLVIDA") && d.status !== "CANCELADA",
    );
    if (openDispute) {
      throw new DomainError(
        "ORDER_IN_DISPUTE",
        "Ordem com disputa aberta não pode ser liquidada",
      );
    }

    const result = await postTransaction(
      tx,
      serviceSettlementTransaction({
        orderId: order.id,
        providerId: order.providerId,
        grossAmountCents: order.grossAmountCents,
        commissionAmountCents: order.commissionAmountCents,
        providerNetAmountCents: order.providerNetAmountCents,
        currency: "BRL",
        correlationId,
      }),
    );

    if (!result.created) {
      logger.info("Ordem já liquidada — nenhum crédito adicional", {
        correlationId,
        orderId,
      });
      return order;
    }

    await tx.commission.create({
      data: {
        orderId: order.id,
        ruleId: order.snapshot?.ruleId,
        amountCents: order.commissionAmountCents,
      },
    });

    const balance = await lockProviderBalance(tx, order.providerId);
    await saveProviderBalance(
      tx,
      order.providerId,
      creditPending(balance, order.providerNetAmountCents),
    );

    orderMachine.transition(order.status, "LIQUIDADA");
    const updated = await tx.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: "LIQUIDADA", settledAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        action: "ORDER_SETTLED",
        entityType: "MarketplaceOrder",
        entityId: order.id,
        newValue: {
          commissionAmountCents: order.commissionAmountCents,
          providerNetAmountCents: order.providerNetAmountCents,
          ledgerTransactionId: result.transactionId,
        },
        correlationId,
      },
    });

    logger.info("Ordem liquidada", {
      correlationId,
      orderId,
      commissionAmountCents: order.commissionAmountCents,
      providerNetAmountCents: order.providerNetAmountCents,
    });

    return updated;
  });
}

/**
 * Libera o saldo pendente após a janela de segurança (§29).
 *
 * Job periódico. Só libera se a janela venceu e não há disputa — nunca por
 * requisição do frontend.
 */
export async function releaseEligibleBalances(
  correlationId: string,
  now: Date = new Date(),
): Promise<{ releasedOrders: string[]; totalCents: number }> {
  const candidates = await prisma.marketplaceOrder.findMany({
    where: {
      status: "LIQUIDADA",
      releasedAt: null,
      completedAt: { not: null },
      disputes: { none: { status: { notIn: ["RESOLVIDA_PRESTADOR", "CANCELADA"] } } },
    },
    select: {
      id: true,
      providerId: true,
      providerNetAmountCents: true,
      completedAt: true,
      securityWindowHours: true,
    },
  });

  const releasedOrders: string[] = [];
  let totalCents = 0;

  for (const order of candidates) {
    const windowEnd = new Date(
      order.completedAt!.getTime() + order.securityWindowHours * 3_600_000,
    );
    if (windowEnd.getTime() > now.getTime()) continue;

    await prisma.$transaction(async (tx) => {
      // Releitura sob lock: outra execução do job pode ter liberado antes.
      const fresh = await tx.marketplaceOrder.findUniqueOrThrow({
        where: { id: order.id },
        select: { releasedAt: true },
      });
      if (fresh.releasedAt) return;

      const balance = await lockProviderBalance(tx, order.providerId);
      await saveProviderBalance(
        tx,
        order.providerId,
        releasePendingToAvailable(balance, order.providerNetAmountCents),
      );
      await tx.marketplaceOrder.update({
        where: { id: order.id },
        data: { releasedAt: now },
      });

      releasedOrders.push(order.id);
      totalCents += order.providerNetAmountCents;
    });
  }

  if (releasedOrders.length > 0) {
    logger.info("Saldos liberados após janela de segurança", {
      correlationId,
      orders: releasedOrders.length,
      totalCents,
    });
  }

  return { releasedOrders, totalCents };
}
