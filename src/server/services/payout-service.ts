/**
 * Repasses (§28) e conciliação (§32).
 *
 * O saque é o ponto de maior risco de corrida do sistema: dois pedidos
 * simultâneos não podem sacar o mesmo saldo duas vezes. A proteção é o lock
 * de linha em `lockProviderBalance` somado à máquina de estado do payout.
 */

import { DomainError } from "@/domain/shared/errors";
import { payoutTransaction } from "@/domain/financial/ledger";
import {
  moveToTransit,
  returnTransitToAvailable,
  settleTransit,
} from "@/domain/financial/balance";
import { payoutMachine } from "@/domain/state-machines";
import { prisma } from "@/server/db/prisma";
import {
  lockProviderBalance,
  postTransaction,
  providerBalanceFromLedger,
  saveProviderBalance,
} from "@/server/ledger/repository";
import { logger } from "@/server/observability/logger";

export interface RequestPayoutInput {
  providerId: string;
  amountCents: number;
  destinationType: "PIX" | "BANK_ACCOUNT";
  destinationKey: string;
  destinationName?: string;
}

/** Solicita repasse: available → inTransit, dentro de uma transação com lock. */
export async function requestPayout(
  input: RequestPayoutInput,
  correlationId: string,
) {
  if (input.amountCents <= 0) {
    throw new DomainError("PAYOUT_INVALID_AMOUNT", "Valor do repasse deve ser positivo");
  }

  return prisma.$transaction(async (tx) => {
    const balance = await lockProviderBalance(tx, input.providerId);

    if (input.amountCents > balance.availableCents) {
      throw new DomainError(
        "INSUFFICIENT_AVAILABLE_BALANCE",
        `Saldo disponível de ${balance.availableCents} centavos é menor que o solicitado`,
      );
    }

    // O domínio recusa qualquer estado negativo antes de tocarmos no banco.
    await saveProviderBalance(
      tx,
      input.providerId,
      moveToTransit(balance, input.amountCents),
    );

    const payout = await tx.payout.create({
      data: {
        providerId: input.providerId,
        amountCents: input.amountCents,
        status: "REQUESTED",
        destinationType: input.destinationType,
        destinationKey: input.destinationKey,
        destinationName: input.destinationName,
        idempotencyKey: `payout-request:${input.providerId}:${Date.now()}`,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "PAYOUT_REQUESTED",
        entityType: "Payout",
        entityId: payout.id,
        newValue: { amountCents: input.amountCents, destinationType: input.destinationType },
        correlationId,
      },
    });

    logger.info("Repasse solicitado", {
      correlationId,
      payoutId: payout.id,
      providerId: input.providerId,
      amountCents: input.amountCents,
    });

    return payout;
  });
}

/** Envia ao PSP. Estado intermediário explícito, para retry seguro. */
export async function processPayout(payoutId: string, correlationId: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
    payoutMachine.transition(payout.status, "PROCESSING");

    const updated = await tx.payout.update({
      where: { id: payoutId },
      data: { status: "PROCESSING", processedAt: new Date() },
    });

    logger.info("Repasse em processamento", { correlationId, payoutId });
    return updated;
  });
}

/**
 * Confirmação do PSP: baixa a conta a pagar no ledger e retira o valor de
 * inTransit. Idempotente pela chave `payout:<id>`.
 */
export async function completePayout(
  payoutId: string,
  externalReference: string,
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUniqueOrThrow({ where: { id: payoutId } });

    if (payout.status === "PAID") {
      logger.info("Repasse já pago — nenhum efeito adicional", { correlationId, payoutId });
      return payout;
    }
    payoutMachine.transition(payout.status, "PAID");

    const result = await postTransaction(
      tx,
      payoutTransaction({
        payoutId: payout.id,
        orderIds: [],
        providerId: payout.providerId,
        amountCents: payout.amountCents,
        currency: "BRL",
        correlationId,
        externalReference,
      }),
    );

    if (result.created) {
      const balance = await lockProviderBalance(tx, payout.providerId);
      await saveProviderBalance(
        tx,
        payout.providerId,
        settleTransit(balance, payout.amountCents),
      );
    }

    const updated = await tx.payout.update({
      where: { id: payoutId },
      data: { status: "PAID", paidAt: new Date(), externalReference },
    });

    await tx.auditLog.create({
      data: {
        action: "PAYOUT_COMPLETED",
        entityType: "Payout",
        entityId: payout.id,
        newValue: { amountCents: payout.amountCents, externalReference },
        correlationId,
      },
    });

    logger.info("Repasse concluído", {
      correlationId,
      payoutId,
      amountCents: payout.amountCents,
    });

    return updated;
  });
}

/** Falha no PSP: o dinheiro volta para disponível, nunca some. */
export async function failPayout(
  payoutId: string,
  reason: string,
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
    payoutMachine.transition(payout.status, "FAILED");

    const balance = await lockProviderBalance(tx, payout.providerId);
    await saveProviderBalance(
      tx,
      payout.providerId,
      returnTransitToAvailable(balance, payout.amountCents),
    );

    const updated = await tx.payout.update({
      where: { id: payoutId },
      data: { status: "FAILED", failedAt: new Date(), failureReason: reason },
    });

    logger.warn("Repasse falhou — saldo devolvido ao disponível", {
      correlationId,
      payoutId,
      reason,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Conciliação (§32)
// ---------------------------------------------------------------------------

export interface Divergence {
  type:
    | "SALDO_DIVERGENTE"
    | "LEDGER_DESBALANCEADO"
    | "PAGAMENTO_SEM_LANCAMENTO"
    | "WEBHOOK_NAO_PROCESSADO";
  description: string;
  reference: string;
  expectedCents?: number;
  actualCents?: number;
}

/**
 * Compara o saldo materializado com o que o ledger diz, verifica o
 * balanceamento global e procura pagamentos confirmados sem lançamento.
 *
 * Divergência vira pendência para análise humana — NUNCA ajuste automático
 * de saldo. Corrigir dinheiro sozinho é como um bug vira prejuízo silencioso.
 */
export async function runReconciliation(
  providerName: string,
  periodStart: Date,
  periodEnd: Date,
  correlationId: string,
) {
  const run = await prisma.reconciliationRun.create({
    data: { provider: providerName, periodStart, periodEnd, status: "EM_ANDAMENTO" },
  });

  const divergences: Divergence[] = [];

  // 1. Saldo materializado × ledger
  const balances = await prisma.providerBalance.findMany();
  for (const balance of balances) {
    const fromLedger = await providerBalanceFromLedger(prisma, balance.providerId);
    const materialized =
      balance.pendingCents +
      balance.availableCents +
      balance.blockedCents +
      balance.inTransitCents;
    if (fromLedger !== materialized) {
      divergences.push({
        type: "SALDO_DIVERGENTE",
        description: `Saldo do prestador diverge do ledger`,
        reference: balance.providerId,
        expectedCents: fromLedger,
        actualCents: materialized,
      });
    }
  }

  // 2. O ledger inteiro deve somar zero
  const entries = await prisma.ledgerEntry.findMany({
    select: { direction: true, amountCents: true },
  });
  const net = entries.reduce(
    (acc, e) => acc + (e.direction === "DEBIT" ? e.amountCents : -e.amountCents),
    0,
  );
  if (net !== 0) {
    divergences.push({
      type: "LEDGER_DESBALANCEADO",
      description: "Soma global de débitos e créditos difere de zero",
      reference: "GLOBAL",
      actualCents: net,
    });
  }

  // 3. Pagamento confirmado sem lançamento correspondente
  const paidPayments = await prisma.payment.findMany({
    where: { status: "PAID", createdAt: { gte: periodStart, lte: periodEnd } },
    select: { id: true, orderId: true, amountCents: true },
  });
  for (const payment of paidPayments) {
    const posted = await prisma.ledgerTransaction.findUnique({
      where: { idempotencyKey: `payment-captured:${payment.id}` },
    });
    if (!posted) {
      divergences.push({
        type: "PAGAMENTO_SEM_LANCAMENTO",
        description: "Pagamento confirmado sem lançamento no ledger",
        reference: payment.id,
        expectedCents: payment.amountCents,
      });
    }
  }

  // 4. Webhooks recebidos e nunca processados
  const unprocessed = await prisma.paymentEvent.count({
    where: { processed: false, receivedAt: { gte: periodStart, lte: periodEnd } },
  });
  if (unprocessed > 0) {
    divergences.push({
      type: "WEBHOOK_NAO_PROCESSADO",
      description: `${unprocessed} webhook(s) recebidos e não processados`,
      reference: "PAYMENT_EVENTS",
    });
  }

  const internalTotal = paidPayments.reduce((acc, p) => acc + p.amountCents, 0);

  const finished = await prisma.reconciliationRun.update({
    where: { id: run.id },
    data: {
      status: divergences.length > 0 ? "COM_DIVERGENCIAS" : "CONCLUIDA",
      internalCount: paidPayments.length,
      externalCount: paidPayments.length,
      matchedCount: paidPayments.length - divergences.length,
      divergenceCount: divergences.length,
      internalTotalCents: internalTotal,
      externalTotalCents: internalTotal,
      divergences: divergences as unknown as object[],
      finishedAt: new Date(),
    },
  });

  logger.info("Conciliação concluída", {
    correlationId,
    runId: finished.id,
    divergences: divergences.length,
  });

  return { run: finished, divergences };
}
