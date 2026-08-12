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
import { emitEvent } from "@/server/events";
import { registrarEvento } from "@/server/services/analytics-service";
import { recordOrderEvent } from "@/server/services/message-service";

export type ProviderOrderAction =
  | { type: "SCHEDULE"; scheduledAt: Date }
  | { type: "START" }
  | { type: "REQUEST_COMPLETION" };

/** Fronteira única das ações do prestador, incluindo a posse da ordem. */
export async function runProviderOrderAction(
  orderId: string,
  providerId: string,
  action: ProviderOrderAction,
  correlationId: string,
) {
  const ownedOrder = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, providerId },
    select: { id: true },
  });
  if (!ownedOrder) return null;

  switch (action.type) {
    case "SCHEDULE":
      return scheduleService(orderId, action.scheduledAt, correlationId);
    case "START":
      return startService(orderId, correlationId);
    case "REQUEST_COMPLETION":
      return requestServiceCompletion(orderId, correlationId);
  }
}

/**
 * Confirmação do cliente com ownership na própria consulta. Retornar `null`
 * mantém ordem alheia indistinguível de uma ordem inexistente na API.
 */
export async function runCustomerCompletionAction(
  orderId: string,
  customerId: string,
  correlationId: string,
) {
  const ownedOrder = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, customerId },
    select: { id: true },
  });
  if (!ownedOrder) return null;

  return confirmServiceCompletion(orderId, correlationId);
}

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

    await recordOrderEvent(tx, order, {
      type: "SCHEDULING",
      content: `Atendimento agendado para ${scheduledAt.toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })}.`,
      metadata: { scheduledAt: scheduledAt.toISOString(), orderId: order.id },
    });

    // Liberação do serviço: só existe porque o pagamento foi confirmado
    await emitEvent(tx, {
      type: "service.released",
      idempotencyKey: `service.released:${order.id}`,
      correlationId,
      data: {
        order_id: order.id,
        scheduled_at: scheduledAt.toISOString(),
        status: "SERVICO_LIBERADO",
      },
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

    await recordOrderEvent(tx, order, {
      type: "SERVICE_STARTED",
      content: "O técnico iniciou o atendimento.",
      metadata: { orderId },
    });

    await emitEvent(tx, {
      type: "service.started",
      idempotencyKey: `service.started:${orderId}`,
      correlationId,
      data: { order_id: orderId, status: "SERVICO_EM_ANDAMENTO" },
    });

    logger.info("Serviço iniciado", { correlationId, orderId });
    return started;
  });
}

/**
 * Conclusão em DOIS passos: o profissional informa que terminou
 * (AGUARDANDO_CONFIRMACAO_CONCLUSAO — mapeado como Appointment CONCLUIDO com
 * a ordem ainda EM_EXECUCAO) e o CLIENTE confirma, levando a ordem a
 * CONCLUIDA. Só a confirmação do cliente inicia a janela de segurança —
 * o profissional não encerra o próprio serviço sozinho.
 */
export async function requestServiceCompletion(orderId: string, correlationId: string) {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({ where: { orderId } });
    const order = await tx.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "EM_EXECUCAO") {
      throw new DomainError(
        "ORDER_NOT_IN_EXECUTION",
        `Ordem em ${order.status} não pode solicitar conclusão`,
      );
    }
    appointmentMachine.transition(appointment.status, "CONCLUIDO");

    const updated = await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "CONCLUIDO", completedAt: new Date() },
    });

    await recordOrderEvent(tx, order, {
      type: "SERVICE_COMPLETED",
      content:
        "O técnico informou que o serviço terminou. Confirme a conclusão para liberar o pagamento.",
      metadata: { orderId, awaitingCustomerConfirmation: true },
    });

    await emitEvent(tx, {
      type: "service.completed_requested",
      idempotencyKey: `service.completed_requested:${orderId}`,
      correlationId,
      data: { order_id: orderId, status: "AGUARDANDO_CONFIRMACAO_CONCLUSAO" },
    });

    logger.info("Conclusão solicitada — aguardando confirmação do cliente", {
      correlationId,
      orderId,
    });
    return updated;
  });
}

/** Cliente confirma a conclusão: inicia a janela de segurança (§29). */
export async function confirmServiceCompletion(orderId: string, correlationId: string) {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({ where: { orderId } });
    const order = await tx.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });

    if (appointment.status !== "CONCLUIDO") {
      throw new DomainError(
        "COMPLETION_NOT_REQUESTED",
        "O profissional ainda não informou a conclusão",
      );
    }
    orderMachine.transition(order.status, "CONCLUIDA");

    const completedAt = new Date();
    const updated = await tx.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: "CONCLUIDA", completedAt },
    });

    await recordOrderEvent(tx, order, {
      type: "SERVICE_COMPLETED",
      content: `Conclusão confirmada pelo cliente. O repasse é liberado após ${updated.securityWindowHours}h sem contestação.`,
      metadata: {
        orderId,
        confirmedAt: completedAt.toISOString(),
        securityWindowHours: updated.securityWindowHours,
      },
    });

    await emitEvent(tx, {
      type: "service.completed",
      idempotencyKey: `service.completed:${orderId}`,
      correlationId,
      data: { order_id: orderId, status: "SERVICO_CONCLUIDO" },
    });
    await emitEvent(tx, {
      type: "review.requested",
      idempotencyKey: `review.requested:${orderId}`,
      correlationId,
      data: { order_id: orderId },
    });

    // Marco do funil (§60): serviço entregue e aceito pelo cliente.
    await registrarEvento(tx, {
      nome: "servico_concluido",
      propriedades: { orderId },
    });

    logger.info("Conclusão confirmada — janela de segurança iniciada", {
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
