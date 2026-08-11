/**
 * Ledger de partidas dobradas (§21).
 *
 * Domínio puro: constrói e valida transações balanceadas. A persistência
 * (e a garantia de idempotência via unique constraint) fica em src/server.
 *
 * Invariante central: em toda transação, soma dos débitos = soma dos créditos.
 * Uma transação desbalanceada NUNCA é construída — o erro é lançado antes
 * de qualquer I/O.
 */

import { FinancialInvariantError } from "../shared/errors";
import type { Currency } from "../shared/money";

export type LedgerDirection = "DEBIT" | "CREDIT";

export type LedgerEntryType =
  | "PAYMENT_CAPTURED"
  | "COMMISSION"
  | "PROVIDER_CREDIT"
  | "PAYOUT"
  | "REFUND"
  | "CHARGEBACK"
  | "GATEWAY_FEE"
  | "ADJUSTMENT"
  | "REVERSAL";

/** Contas do plano de contas (§8.4 do Blueprint). */
export const LEDGER_ACCOUNTS = {
  PLATFORM_CASH: "PLATFORM_CASH",
  PLATFORM_REVENUE: "PLATFORM_REVENUE",
  CUSTOMER_ESCROW: "CUSTOMER_ESCROW",
  GATEWAY_FEES: "GATEWAY_FEES",
  REFUNDS_PAYABLE: "REFUNDS_PAYABLE",
  CHARGEBACK_LOSSES: "CHARGEBACK_LOSSES",
  /** Conta individual por prestador. */
  providerPayable: (providerId: string) => `PROVIDER_PAYABLE:${providerId}`,
} as const;

export interface LedgerEntryDraft {
  accountCode: string;
  direction: LedgerDirection;
  amountCents: number;
  metadata?: Record<string, unknown>;
}

export interface LedgerTransactionDraft {
  type: LedgerEntryType;
  description: string;
  idempotencyKey: string;
  orderId?: string;
  correlationId?: string;
  externalReference?: string;
  reversesTransactionId?: string;
  currency: Currency;
  entries: readonly LedgerEntryDraft[];
}

function validateEntries(entries: readonly LedgerEntryDraft[]): void {
  if (entries.length < 2) {
    throw new FinancialInvariantError(
      "LEDGER_TOO_FEW_ENTRIES",
      "Transação de ledger exige ao menos duas partidas (débito e crédito)",
    );
  }
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0) {
      throw new FinancialInvariantError(
        "LEDGER_INVALID_AMOUNT",
        `Partida com valor inválido: ${entry.amountCents} (conta ${entry.accountCode})`,
      );
    }
  }
  const debits = entries
    .filter((e) => e.direction === "DEBIT")
    .reduce((acc, e) => acc + e.amountCents, 0);
  const credits = entries
    .filter((e) => e.direction === "CREDIT")
    .reduce((acc, e) => acc + e.amountCents, 0);
  if (debits !== credits) {
    throw new FinancialInvariantError(
      "LEDGER_UNBALANCED",
      `Transação desbalanceada: débitos=${debits} créditos=${credits}`,
      { debits, credits },
    );
  }
}

/** Constrói uma transação validada. Única porta de entrada para o ledger. */
export function buildLedgerTransaction(
  draft: LedgerTransactionDraft,
): LedgerTransactionDraft {
  if (!draft.idempotencyKey || draft.idempotencyKey.trim() === "") {
    throw new FinancialInvariantError(
      "LEDGER_MISSING_IDEMPOTENCY_KEY",
      "Toda transação de ledger exige idempotencyKey",
    );
  }
  validateEntries(draft.entries);
  return Object.freeze({ ...draft, entries: Object.freeze([...draft.entries]) });
}

/**
 * Correção nunca apaga (§21): gera a transação espelho (REVERSAL),
 * invertendo débito ↔ crédito com os mesmos valores.
 */
export function buildReversal(
  original: LedgerTransactionDraft & { id: string },
  reason: string,
  idempotencyKey: string,
): LedgerTransactionDraft {
  return buildLedgerTransaction({
    type: "REVERSAL",
    description: `Estorno de lançamento: ${reason}`,
    idempotencyKey,
    orderId: original.orderId,
    correlationId: original.correlationId,
    reversesTransactionId: original.id,
    currency: original.currency,
    entries: original.entries.map((e) => ({
      accountCode: e.accountCode,
      direction: e.direction === "DEBIT" ? "CREDIT" : "DEBIT",
      amountCents: e.amountCents,
      metadata: { reversalOf: original.id },
    })),
  });
}

// ---------------------------------------------------------------------------
// Fábricas dos lançamentos padrão do fluxo (§17, §9 do Blueprint)
// ---------------------------------------------------------------------------

export interface PaymentCapturedInput {
  orderId: string;
  paymentId: string;
  amountCents: number;
  currency: Currency;
  correlationId?: string;
  externalReference?: string;
}

/** Pagamento confirmado: D PLATFORM_CASH / C CUSTOMER_ESCROW */
export function paymentCapturedTransaction(
  input: PaymentCapturedInput,
): LedgerTransactionDraft {
  return buildLedgerTransaction({
    type: "PAYMENT_CAPTURED",
    description: `Pagamento capturado — ordem ${input.orderId}`,
    idempotencyKey: `payment-captured:${input.paymentId}`,
    orderId: input.orderId,
    correlationId: input.correlationId,
    externalReference: input.externalReference,
    currency: input.currency,
    entries: [
      {
        accountCode: LEDGER_ACCOUNTS.PLATFORM_CASH,
        direction: "DEBIT",
        amountCents: input.amountCents,
      },
      {
        accountCode: LEDGER_ACCOUNTS.CUSTOMER_ESCROW,
        direction: "CREDIT",
        amountCents: input.amountCents,
      },
    ],
  });
}

export interface ServiceSettlementInput {
  orderId: string;
  providerId: string;
  grossAmountCents: number;
  commissionAmountCents: number;
  providerNetAmountCents: number;
  currency: Currency;
  correlationId?: string;
}

/**
 * Liquidação após conclusão + janela de segurança (§29):
 * D CUSTOMER_ESCROW (bruto) / C PLATFORM_REVENUE (comissão) + C PROVIDER_PAYABLE (líquido)
 */
export function serviceSettlementTransaction(
  input: ServiceSettlementInput,
): LedgerTransactionDraft {
  if (
    input.commissionAmountCents + input.providerNetAmountCents !==
    input.grossAmountCents
  ) {
    throw new FinancialInvariantError(
      "SETTLEMENT_AMOUNTS_MISMATCH",
      "Comissão + líquido difere do bruto na liquidação",
      input as unknown as Record<string, unknown>,
    );
  }
  return buildLedgerTransaction({
    type: "COMMISSION",
    description: `Liquidação de serviço — ordem ${input.orderId}`,
    idempotencyKey: `settlement:${input.orderId}`,
    orderId: input.orderId,
    correlationId: input.correlationId,
    currency: input.currency,
    entries: [
      {
        accountCode: LEDGER_ACCOUNTS.CUSTOMER_ESCROW,
        direction: "DEBIT",
        amountCents: input.grossAmountCents,
      },
      {
        accountCode: LEDGER_ACCOUNTS.PLATFORM_REVENUE,
        direction: "CREDIT",
        amountCents: input.commissionAmountCents,
      },
      {
        accountCode: LEDGER_ACCOUNTS.providerPayable(input.providerId),
        direction: "CREDIT",
        amountCents: input.providerNetAmountCents,
      },
    ],
  });
}

export interface PayoutInput {
  payoutId: string;
  orderIds: readonly string[];
  providerId: string;
  amountCents: number;
  currency: Currency;
  correlationId?: string;
  externalReference?: string;
}

/** Repasse pago: D PROVIDER_PAYABLE / C PLATFORM_CASH */
export function payoutTransaction(input: PayoutInput): LedgerTransactionDraft {
  return buildLedgerTransaction({
    type: "PAYOUT",
    description: `Repasse ao prestador ${input.providerId}`,
    idempotencyKey: `payout:${input.payoutId}`,
    correlationId: input.correlationId,
    externalReference: input.externalReference,
    currency: input.currency,
    entries: [
      {
        accountCode: LEDGER_ACCOUNTS.providerPayable(input.providerId),
        direction: "DEBIT",
        amountCents: input.amountCents,
      },
      {
        accountCode: LEDGER_ACCOUNTS.PLATFORM_CASH,
        direction: "CREDIT",
        amountCents: input.amountCents,
      },
    ],
  });
}

export interface RefundInput {
  refundId: string;
  orderId: string;
  amountCents: number;
  currency: Currency;
  /** Liquidação já ocorreu? Se sim, o estorno também desfaz comissão e crédito. */
  settled: boolean;
  providerId: string;
  commissionShareCents?: number;
  providerShareCents?: number;
  correlationId?: string;
}

/**
 * Estorno (§30) SEM apagar histórico:
 *  - antes da liquidação: D CUSTOMER_ESCROW / C PLATFORM_CASH (devolve do escrow);
 *  - após a liquidação: desfaz proporcionalmente comissão e crédito do prestador.
 */
export function refundTransaction(input: RefundInput): LedgerTransactionDraft {
  if (!input.settled) {
    return buildLedgerTransaction({
      type: "REFUND",
      description: `Estorno pré-liquidação — ordem ${input.orderId}`,
      idempotencyKey: `refund:${input.refundId}`,
      orderId: input.orderId,
      correlationId: input.correlationId,
      currency: input.currency,
      entries: [
        {
          accountCode: LEDGER_ACCOUNTS.CUSTOMER_ESCROW,
          direction: "DEBIT",
          amountCents: input.amountCents,
        },
        {
          accountCode: LEDGER_ACCOUNTS.PLATFORM_CASH,
          direction: "CREDIT",
          amountCents: input.amountCents,
        },
      ],
    });
  }

  const commissionShare = input.commissionShareCents ?? 0;
  const providerShare = input.providerShareCents ?? 0;
  if (commissionShare + providerShare !== input.amountCents) {
    throw new FinancialInvariantError(
      "REFUND_SHARES_MISMATCH",
      "Partes do estorno pós-liquidação não somam o valor total",
      {
        amountCents: input.amountCents,
        commissionShareCents: commissionShare,
        providerShareCents: providerShare,
      },
    );
  }
  return buildLedgerTransaction({
    type: "REFUND",
    description: `Estorno pós-liquidação — ordem ${input.orderId}`,
    idempotencyKey: `refund:${input.refundId}`,
    orderId: input.orderId,
    correlationId: input.correlationId,
    currency: input.currency,
    entries: (
      [
        {
          accountCode: LEDGER_ACCOUNTS.PLATFORM_REVENUE,
          direction: "DEBIT",
          amountCents: commissionShare,
        },
        {
          accountCode: LEDGER_ACCOUNTS.providerPayable(input.providerId),
          direction: "DEBIT",
          amountCents: providerShare,
        },
        {
          accountCode: LEDGER_ACCOUNTS.PLATFORM_CASH,
          direction: "CREDIT",
          amountCents: input.amountCents,
        },
      ] satisfies LedgerEntryDraft[]
    ).filter((e) => e.amountCents > 0),
  });
}

// ---------------------------------------------------------------------------
// Verificações de integridade (usadas pela conciliação, §32)
// ---------------------------------------------------------------------------

export interface PersistedEntry {
  accountCode: string;
  direction: LedgerDirection;
  amountCents: number;
}

/** Saldo de uma conta a partir das partidas (débito positivo por convenção de ativo). */
export function accountBalance(
  accountCode: string,
  entries: readonly PersistedEntry[],
): number {
  return entries
    .filter((e) => e.accountCode === accountCode)
    .reduce(
      (acc, e) => acc + (e.direction === "DEBIT" ? e.amountCents : -e.amountCents),
      0,
    );
}

/**
 * Saldo devido a um prestador segundo o ledger (créditos - débitos da conta dele).
 * É contra este número que o ProviderBalance materializado é reconciliado.
 */
export function providerLedgerBalance(
  providerId: string,
  entries: readonly PersistedEntry[],
): number {
  const balance = accountBalance(LEDGER_ACCOUNTS.providerPayable(providerId), entries);
  // Evita devolver -0: o valor vaza para JSON, comparações e logs financeiros.
  return balance === 0 ? 0 : -balance;
}

/** O ledger inteiro deve somar zero — sanidade global. */
export function ledgerIsBalanced(entries: readonly PersistedEntry[]): boolean {
  const total = entries.reduce(
    (acc, e) => acc + (e.direction === "DEBIT" ? e.amountCents : -e.amountCents),
    0,
  );
  return total === 0;
}
