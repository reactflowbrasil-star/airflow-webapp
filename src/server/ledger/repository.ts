/**
 * Persistência do ledger (§21) e dos saldos (§22).
 *
 * O domínio (`src/domain/financial/ledger.ts`) valida o balanceamento antes
 * de qualquer I/O. Aqui garantimos o resto:
 *   - a idempotência é do banco, via unique em `idempotencyKey`;
 *   - o saldo do prestador é atualizado sob lock, contra saque duplo.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { LedgerTransactionDraft } from "@/domain/financial/ledger";
import {
  type ProviderBalanceState,
  EMPTY_BALANCE,
} from "@/domain/financial/balance";
import { logger } from "@/server/observability/logger";

/** Cliente ou transação — todo método aceita ambos. */
type Db = Prisma.TransactionClient;

const ACCOUNT_TYPE_BY_PREFIX = {
  PLATFORM_CASH: "PLATFORM_CASH",
  PLATFORM_REVENUE: "PLATFORM_REVENUE",
  CUSTOMER_ESCROW: "CUSTOMER_ESCROW",
  GATEWAY_FEES: "GATEWAY_FEES",
  REFUNDS_PAYABLE: "REFUNDS_PAYABLE",
  CHARGEBACK_LOSSES: "CHARGEBACK_LOSSES",
} as const;

/**
 * Resolve o id da conta pelo código, criando-a se necessário.
 * Contas `PROVIDER_PAYABLE:<id>` nascem no primeiro crédito ao prestador.
 */
async function resolveAccountId(db: Db, code: string): Promise<string> {
  const existing = await db.ledgerAccount.findUnique({ where: { code } });
  if (existing) return existing.id;

  const isProviderPayable = code.startsWith("PROVIDER_PAYABLE:");
  const type = isProviderPayable
    ? "PROVIDER_PAYABLE"
    : ACCOUNT_TYPE_BY_PREFIX[code as keyof typeof ACCOUNT_TYPE_BY_PREFIX];

  if (!type) {
    throw new Error(`Código de conta desconhecido no plano de contas: ${code}`);
  }

  const created = await db.ledgerAccount.create({
    data: {
      code,
      type,
      name: isProviderPayable
        ? `A pagar — prestador ${code.split(":")[1]}`
        : code,
      ownerProviderId: isProviderPayable ? code.split(":")[1] : null,
    },
  });
  return created.id;
}

export interface PostResult {
  transactionId: string;
  /** false quando a transação já existia — evento repetido, zero efeito novo. */
  created: boolean;
}

/**
 * Grava uma transação de ledger já validada pelo domínio.
 *
 * Repetir a mesma `idempotencyKey` não gera segundo efeito financeiro: a
 * unique constraint recusa o insert e devolvemos a transação original.
 * A garantia é do Postgres, não de um `if` na aplicação — o que a torna
 * resistente a concorrência real.
 */
export async function postTransaction(
  db: Db,
  draft: LedgerTransactionDraft,
): Promise<PostResult> {
  const existing = await db.ledgerTransaction.findUnique({
    where: { idempotencyKey: draft.idempotencyKey },
  });
  if (existing) {
    logger.info("Transação de ledger já registrada — ignorando repetição", {
      correlationId: draft.correlationId,
      idempotencyKey: draft.idempotencyKey,
      transactionId: existing.id,
    });
    return { transactionId: existing.id, created: false };
  }

  const entries = await Promise.all(
    draft.entries.map(async (entry) => ({
      accountId: await resolveAccountId(db, entry.accountCode),
      direction: entry.direction,
      amountCents: entry.amountCents,
      currency: draft.currency,
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  );

  try {
    const transaction = await db.ledgerTransaction.create({
      data: {
        type: draft.type,
        description: draft.description,
        idempotencyKey: draft.idempotencyKey,
        orderId: draft.orderId,
        correlationId: draft.correlationId,
        externalReference: draft.externalReference,
        reversesTransactionId: draft.reversesTransactionId,
        currency: draft.currency,
        entries: { create: entries },
      },
    });
    return { transactionId: transaction.id, created: true };
  } catch (error) {
    // Corrida: outro processo inseriu entre o SELECT e o INSERT.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      const winner = await db.ledgerTransaction.findUniqueOrThrow({
        where: { idempotencyKey: draft.idempotencyKey },
      });
      logger.warn("Corrida na gravação do ledger resolvida pela unique constraint", {
        correlationId: draft.correlationId,
        idempotencyKey: draft.idempotencyKey,
      });
      return { transactionId: winner.id, created: false };
    }
    throw error;
  }
}

/**
 * Lê o saldo do prestador com bloqueio de linha.
 *
 * `FOR UPDATE` serializa saques concorrentes: a segunda transação espera a
 * primeira terminar e enxerga o saldo já debitado. Sem isso, dois pedidos de
 * repasse simultâneos leriam o mesmo saldo e sacariam em dobro.
 */
export async function lockProviderBalance(
  db: Db,
  providerId: string,
): Promise<ProviderBalanceState> {
  await db.$queryRaw`SELECT id FROM provider_balances WHERE "providerId" = ${providerId} FOR UPDATE`;

  const balance = await db.providerBalance.findUnique({ where: { providerId } });
  if (!balance) {
    await db.providerBalance.create({ data: { providerId } });
    return EMPTY_BALANCE;
  }

  // Devolve só as quatro categorias: id, version e timestamps não são saldo
  // e não devem atravessar a fronteira para o domínio.
  return {
    pendingCents: balance.pendingCents,
    availableCents: balance.availableCents,
    blockedCents: balance.blockedCents,
    inTransitCents: balance.inTransitCents,
  };
}

/** Grava o novo saldo calculado pelo domínio, incrementando a versão. */
export async function saveProviderBalance(
  db: Db,
  providerId: string,
  next: ProviderBalanceState,
): Promise<void> {
  await db.providerBalance.update({
    where: { providerId },
    data: {
      pendingCents: next.pendingCents,
      availableCents: next.availableCents,
      blockedCents: next.blockedCents,
      inTransitCents: next.inTransitCents,
      version: { increment: 1 },
    },
  });
}

/**
 * Recalcula o saldo devido ao prestador direto das partidas do ledger.
 * É contra este número que o saldo materializado é reconciliado (§32) —
 * divergência indica bug e vira pendência no admin, nunca ajuste automático.
 */
export async function providerBalanceFromLedger(
  db: Db,
  providerId: string,
): Promise<number> {
  const rows = await db.ledgerEntry.findMany({
    where: { account: { code: `PROVIDER_PAYABLE:${providerId}` } },
    select: { direction: true, amountCents: true },
  });
  return rows.reduce(
    (acc, row) => acc + (row.direction === "CREDIT" ? row.amountCents : -row.amountCents),
    0,
  );
}
