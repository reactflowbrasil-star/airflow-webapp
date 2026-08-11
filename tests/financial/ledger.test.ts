import { describe, expect, it } from "vitest";

import {
  LEDGER_ACCOUNTS,
  accountBalance,
  buildLedgerTransaction,
  buildReversal,
  ledgerIsBalanced,
  payoutTransaction,
  paymentCapturedTransaction,
  providerLedgerBalance,
  refundTransaction,
  serviceSettlementTransaction,
  type PersistedEntry,
} from "@/domain/financial/ledger";
import { FinancialInvariantError } from "@/domain/shared/errors";

describe("Ledger — partidas dobradas (§21)", () => {
  it("recusa transação desbalanceada", () => {
    expect(() =>
      buildLedgerTransaction({
        type: "ADJUSTMENT",
        description: "quebrado",
        idempotencyKey: "k1",
        currency: "BRL",
        entries: [
          { accountCode: "A", direction: "DEBIT", amountCents: 100 },
          { accountCode: "B", direction: "CREDIT", amountCents: 99 },
        ],
      }),
    ).toThrow(FinancialInvariantError);
  });

  it("recusa transação com menos de duas partidas", () => {
    expect(() =>
      buildLedgerTransaction({
        type: "ADJUSTMENT",
        description: "só um lado",
        idempotencyKey: "k2",
        currency: "BRL",
        entries: [{ accountCode: "A", direction: "DEBIT", amountCents: 100 }],
      }),
    ).toThrow(/duas partidas/);
  });

  it("recusa partida com valor zero ou negativo", () => {
    expect(() =>
      buildLedgerTransaction({
        type: "ADJUSTMENT",
        description: "valor zero",
        idempotencyKey: "k3",
        currency: "BRL",
        entries: [
          { accountCode: "A", direction: "DEBIT", amountCents: 0 },
          { accountCode: "B", direction: "CREDIT", amountCents: 0 },
        ],
      }),
    ).toThrow(FinancialInvariantError);
  });

  it("exige idempotencyKey em toda transação (§27)", () => {
    expect(() =>
      buildLedgerTransaction({
        type: "ADJUSTMENT",
        description: "sem chave",
        idempotencyKey: "",
        currency: "BRL",
        entries: [
          { accountCode: "A", direction: "DEBIT", amountCents: 10 },
          { accountCode: "B", direction: "CREDIT", amountCents: 10 },
        ],
      }),
    ).toThrow(/idempotencyKey/);
  });

  it("aceita transação balanceada com múltiplas partidas", () => {
    const tx = buildLedgerTransaction({
      type: "COMMISSION",
      description: "ok",
      idempotencyKey: "k4",
      currency: "BRL",
      entries: [
        { accountCode: "A", direction: "DEBIT", amountCents: 30000 },
        { accountCode: "B", direction: "CREDIT", amountCents: 4500 },
        { accountCode: "C", direction: "CREDIT", amountCents: 25500 },
      ],
    });
    expect(tx.entries).toHaveLength(3);
  });
});

describe("Ledger — fluxo financeiro completo (§17)", () => {
  const orderId = "order-1";
  const providerId = "prov-1";

  it("pagamento de R$ 300 credita o escrow", () => {
    const tx = paymentCapturedTransaction({
      orderId,
      paymentId: "pay-1",
      amountCents: 30000,
      currency: "BRL",
    });
    expect(tx.idempotencyKey).toBe("payment-captured:pay-1");
    expect(
      tx.entries.find((e) => e.accountCode === LEDGER_ACCOUNTS.PLATFORM_CASH)?.direction,
    ).toBe("DEBIT");
    expect(
      tx.entries.find((e) => e.accountCode === LEDGER_ACCOUNTS.CUSTOMER_ESCROW)
        ?.amountCents,
    ).toBe(30000);
  });

  it("liquidação separa comissão e líquido do prestador", () => {
    const tx = serviceSettlementTransaction({
      orderId,
      providerId,
      grossAmountCents: 30000,
      commissionAmountCents: 4500,
      providerNetAmountCents: 25500,
      currency: "BRL",
    });
    const revenue = tx.entries.find(
      (e) => e.accountCode === LEDGER_ACCOUNTS.PLATFORM_REVENUE,
    );
    const payable = tx.entries.find(
      (e) => e.accountCode === LEDGER_ACCOUNTS.providerPayable(providerId),
    );
    expect(revenue?.amountCents).toBe(4500);
    expect(payable?.amountCents).toBe(25500);
  });

  it("recusa liquidação cujos valores não fecham com o bruto", () => {
    expect(() =>
      serviceSettlementTransaction({
        orderId,
        providerId,
        grossAmountCents: 30000,
        commissionAmountCents: 4500,
        providerNetAmountCents: 25000, // faltam 500
        currency: "BRL",
      }),
    ).toThrow(FinancialInvariantError);
  });

  it("o ciclo completo pagamento → liquidação → repasse fecha em zero", () => {
    const entries: PersistedEntry[] = [
      ...paymentCapturedTransaction({
        orderId,
        paymentId: "pay-1",
        amountCents: 30000,
        currency: "BRL",
      }).entries,
      ...serviceSettlementTransaction({
        orderId,
        providerId,
        grossAmountCents: 30000,
        commissionAmountCents: 4500,
        providerNetAmountCents: 25500,
        currency: "BRL",
      }).entries,
      ...payoutTransaction({
        payoutId: "po-1",
        orderIds: [orderId],
        providerId,
        amountCents: 25500,
        currency: "BRL",
      }).entries,
    ];

    expect(ledgerIsBalanced(entries)).toBe(true);
    // Caixa: entrou 30000, saiu 25500 → sobra a comissão
    expect(accountBalance(LEDGER_ACCOUNTS.PLATFORM_CASH, entries)).toBe(4500);
    // Escrow zerado após a liquidação
    expect(accountBalance(LEDGER_ACCOUNTS.CUSTOMER_ESCROW, entries)).toBe(0);
    // Receita reconhecida
    expect(accountBalance(LEDGER_ACCOUNTS.PLATFORM_REVENUE, entries)).toBe(-4500);
    // Prestador já foi pago: nada a pagar
    expect(providerLedgerBalance(providerId, entries)).toBe(0);
  });

  it("saldo do prestador reflete o líquido antes do repasse", () => {
    const entries: PersistedEntry[] = [
      ...paymentCapturedTransaction({
        orderId,
        paymentId: "pay-1",
        amountCents: 30000,
        currency: "BRL",
      }).entries,
      ...serviceSettlementTransaction({
        orderId,
        providerId,
        grossAmountCents: 30000,
        commissionAmountCents: 4500,
        providerNetAmountCents: 25500,
        currency: "BRL",
      }).entries,
    ];
    expect(providerLedgerBalance(providerId, entries)).toBe(25500);
  });
});

describe("Ledger — estornos sem apagar histórico (§30)", () => {
  it("estorno pré-liquidação devolve do escrow", () => {
    const tx = refundTransaction({
      refundId: "ref-1",
      orderId: "order-1",
      amountCents: 30000,
      currency: "BRL",
      settled: false,
      providerId: "prov-1",
    });
    expect(
      tx.entries.find((e) => e.accountCode === LEDGER_ACCOUNTS.CUSTOMER_ESCROW)
        ?.direction,
    ).toBe("DEBIT");
  });

  it("estorno pós-liquidação desfaz comissão e crédito proporcionalmente", () => {
    const tx = refundTransaction({
      refundId: "ref-2",
      orderId: "order-1",
      amountCents: 30000,
      currency: "BRL",
      settled: true,
      providerId: "prov-1",
      commissionShareCents: 4500,
      providerShareCents: 25500,
    });
    expect(tx.entries).toHaveLength(3);
    expect(ledgerIsBalanced(tx.entries as PersistedEntry[])).toBe(true);
  });

  it("estorno parcial mantém o balanceamento", () => {
    const tx = refundTransaction({
      refundId: "ref-3",
      orderId: "order-1",
      amountCents: 15000,
      currency: "BRL",
      settled: true,
      providerId: "prov-1",
      commissionShareCents: 2250,
      providerShareCents: 12750,
    });
    expect(ledgerIsBalanced(tx.entries as PersistedEntry[])).toBe(true);
  });

  it("recusa estorno cujas partes não somam o total", () => {
    expect(() =>
      refundTransaction({
        refundId: "ref-4",
        orderId: "order-1",
        amountCents: 30000,
        currency: "BRL",
        settled: true,
        providerId: "prov-1",
        commissionShareCents: 4500,
        providerShareCents: 20000,
      }),
    ).toThrow(FinancialInvariantError);
  });

  it("reversão espelha a transação original e zera o efeito líquido", () => {
    const original = {
      ...paymentCapturedTransaction({
        orderId: "order-1",
        paymentId: "pay-1",
        amountCents: 30000,
        currency: "BRL",
      }),
      id: "tx-original",
    };
    const reversal = buildReversal(original, "erro operacional", "rev-1");

    expect(reversal.reversesTransactionId).toBe("tx-original");
    const combined = [...original.entries, ...reversal.entries] as PersistedEntry[];
    expect(accountBalance(LEDGER_ACCOUNTS.PLATFORM_CASH, combined)).toBe(0);
    expect(accountBalance(LEDGER_ACCOUNTS.CUSTOMER_ESCROW, combined)).toBe(0);
  });
});

describe("Ledger — idempotência das chaves (§27)", () => {
  it("o mesmo pagamento gera sempre a mesma chave", () => {
    const a = paymentCapturedTransaction({
      orderId: "o1",
      paymentId: "pay-42",
      amountCents: 1000,
      currency: "BRL",
    });
    const b = paymentCapturedTransaction({
      orderId: "o1",
      paymentId: "pay-42",
      amountCents: 1000,
      currency: "BRL",
    });
    // Chave idêntica → o unique constraint do banco recusa o segundo insert
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
  });

  it("liquidação e repasse têm chaves derivadas do recurso", () => {
    expect(
      serviceSettlementTransaction({
        orderId: "o9",
        providerId: "p1",
        grossAmountCents: 100,
        commissionAmountCents: 15,
        providerNetAmountCents: 85,
        currency: "BRL",
      }).idempotencyKey,
    ).toBe("settlement:o9");

    expect(
      payoutTransaction({
        payoutId: "po-7",
        orderIds: [],
        providerId: "p1",
        amountCents: 100,
        currency: "BRL",
      }).idempotencyKey,
    ).toBe("payout:po-7");
  });
});
