import { describe, expect, it } from "vitest";

import {
  buildCommissionSnapshot,
  calculateCommission,
  resolveCommissionRule,
  type CommissionContext,
  type CommissionRuleData,
} from "@/domain/financial/commission";
import { money } from "@/domain/shared/money";
import { FinancialInvariantError } from "@/domain/shared/errors";

const PASSADO = new Date("2026-01-01T00:00:00Z");
const AGORA = new Date("2026-08-11T12:00:00Z");
const FUTURO = new Date("2027-01-01T00:00:00Z");

function rule(overrides: Partial<CommissionRuleData> = {}): CommissionRuleData {
  return {
    id: "rule-global",
    name: "Comissão global 15%",
    scope: "GLOBAL",
    percentBps: 1500,
    fixedFeeCents: 0,
    minCommissionCents: null,
    maxCommissionCents: null,
    providerId: null,
    categoryId: null,
    cityId: null,
    planCode: null,
    campaignCode: null,
    priority: 0,
    version: 1,
    active: true,
    validFrom: PASSADO,
    validTo: null,
    ...overrides,
  };
}

const ctx: CommissionContext = {
  providerId: "prov-1",
  categoryId: "cat-limpeza",
  cityId: "city-sp",
  planCode: "PRO",
  campaignCodes: ["INVERNO2026"],
  at: AGORA,
};

describe("Commission Engine — precedência de regras (§20)", () => {
  it("regra do prestador vence promocional, cidade, categoria e global", () => {
    const regras = [
      rule({ id: "g", scope: "GLOBAL", percentBps: 1500 }),
      rule({ id: "cat", scope: "CATEGORY", categoryId: "cat-limpeza", percentBps: 1400 }),
      rule({ id: "city", scope: "CITY", cityId: "city-sp", percentBps: 1300 }),
      rule({ id: "promo", scope: "PROMOTIONAL", campaignCode: "INVERNO2026", percentBps: 1000 }),
      rule({ id: "prov", scope: "PROVIDER", providerId: "prov-1", percentBps: 800 }),
    ];
    expect(resolveCommissionRule(regras, ctx)?.id).toBe("prov");
  });

  it("promocional vence cidade, categoria e global", () => {
    const regras = [
      rule({ id: "g", scope: "GLOBAL" }),
      rule({ id: "cat", scope: "CATEGORY", categoryId: "cat-limpeza" }),
      rule({ id: "city", scope: "CITY", cityId: "city-sp" }),
      rule({ id: "promo", scope: "PROMOTIONAL", campaignCode: "INVERNO2026" }),
    ];
    expect(resolveCommissionRule(regras, ctx)?.id).toBe("promo");
  });

  it("cai para a global quando nenhuma específica casa", () => {
    const regras = [
      rule({ id: "g", scope: "GLOBAL" }),
      rule({ id: "outro-prov", scope: "PROVIDER", providerId: "prov-999" }),
      rule({ id: "outra-cat", scope: "CATEGORY", categoryId: "cat-instalacao" }),
    ];
    expect(resolveCommissionRule(regras, ctx)?.id).toBe("g");
  });

  it("desempata pelo campo priority dentro do mesmo escopo", () => {
    const regras = [
      rule({ id: "a", scope: "CATEGORY", categoryId: "cat-limpeza", priority: 1 }),
      rule({ id: "b", scope: "CATEGORY", categoryId: "cat-limpeza", priority: 9 }),
    ];
    expect(resolveCommissionRule(regras, ctx)?.id).toBe("b");
  });

  it("ignora regras inativas, futuras ou expiradas", () => {
    const regras = [
      rule({ id: "inativa", scope: "PROVIDER", providerId: "prov-1", active: false }),
      rule({ id: "futura", scope: "PROVIDER", providerId: "prov-1", validFrom: FUTURO }),
      rule({
        id: "expirada",
        scope: "PROVIDER",
        providerId: "prov-1",
        validTo: new Date("2026-02-01T00:00:00Z"),
      }),
      rule({ id: "g", scope: "GLOBAL" }),
    ];
    expect(resolveCommissionRule(regras, ctx)?.id).toBe("g");
  });

  it("devolve null quando não há regra aplicável", () => {
    expect(resolveCommissionRule([], ctx)).toBeNull();
  });

  it("é determinística — mesma entrada, mesmo resultado", () => {
    const regras = [
      rule({ id: "z", scope: "CATEGORY", categoryId: "cat-limpeza" }),
      rule({ id: "a", scope: "CATEGORY", categoryId: "cat-limpeza" }),
    ];
    const primeiro = resolveCommissionRule(regras, ctx)?.id;
    for (let i = 0; i < 20; i++) {
      expect(resolveCommissionRule([...regras].reverse(), ctx)?.id).toBe(primeiro);
    }
  });
});

describe("Commission Engine — cálculo (§20)", () => {
  it("calcula 15% de R$ 300,00 → comissão R$ 45,00, líquido R$ 255,00", () => {
    const r = calculateCommission(rule(), money(30000));
    expect(r.commissionAmount.amountCents).toBe(4500);
    expect(r.providerNetAmount.amountCents).toBe(25500);
  });

  it("aplica taxa fixa somada ao percentual", () => {
    const r = calculateCommission(rule({ fixedFeeCents: 200 }), money(30000));
    expect(r.commissionAmount.amountCents).toBe(4700);
    expect(r.providerNetAmount.amountCents).toBe(25300);
  });

  it("respeita comissão mínima", () => {
    const r = calculateCommission(
      rule({ percentBps: 100, minCommissionCents: 500 }),
      money(10000),
    );
    expect(r.commissionAmount.amountCents).toBe(500);
  });

  it("respeita comissão máxima", () => {
    const r = calculateCommission(
      rule({ percentBps: 5000, maxCommissionCents: 10000 }),
      money(100000),
    );
    expect(r.commissionAmount.amountCents).toBe(10000);
  });

  it("desconta antes de calcular a comissão", () => {
    const r = calculateCommission(rule(), money(30000), money(10000));
    // base = 20000; 15% = 3000; líquido = 17000
    expect(r.commissionAmount.amountCents).toBe(3000);
    expect(r.providerNetAmount.amountCents).toBe(17000);
  });

  it("nunca deixa o prestador devendo — comissão limitada à base", () => {
    const r = calculateCommission(
      rule({ percentBps: 10000, fixedFeeCents: 999999 }),
      money(10000),
    );
    expect(r.commissionAmount.amountCents).toBe(10000);
    expect(r.providerNetAmount.amountCents).toBe(0);
  });

  it("conserva o total: base = comissão + líquido, para toda faixa de valores", () => {
    for (let bruto = 1000; bruto <= 500000; bruto += 997) {
      for (const bps of [500, 1000, 1500, 1834, 2500]) {
        const r = calculateCommission(rule({ percentBps: bps }), money(bruto));
        expect(r.commissionAmount.amountCents + r.providerNetAmount.amountCents).toBe(
          bruto,
        );
        expect(r.commissionAmount.amountCents).toBeGreaterThanOrEqual(0);
        expect(r.providerNetAmount.amountCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rejeita valor bruto não positivo", () => {
    expect(() => calculateCommission(rule(), money(0))).toThrow(FinancialInvariantError);
    expect(() => calculateCommission(rule(), money(-100))).toThrow(FinancialInvariantError);
  });

  it("rejeita desconto maior que o bruto", () => {
    expect(() => calculateCommission(rule(), money(10000), money(20000))).toThrow(
      FinancialInvariantError,
    );
  });
});

describe("Snapshot financeiro — imutabilidade da regra (§19)", () => {
  it("congela regra, versão e valores aplicados", () => {
    const r = calculateCommission(rule({ id: "r1", version: 3 }), money(30000));
    const snap = buildCommissionSnapshot(r);

    expect(snap.ruleId).toBe("r1");
    expect(snap.ruleVersion).toBe(3);
    expect(snap.percentBps).toBe(1500);
    expect(snap.commissionAmountCents).toBe(4500);
    expect(snap.providerNetAmountCents).toBe(25500);
    expect(snap.ruleSnapshot).toMatchObject({ id: "r1", percentBps: 1500, version: 3 });
  });

  it("alterar a comissão de 15% para 18% NÃO altera contratação antiga", () => {
    const regraV1 = rule({ id: "global", version: 1, percentBps: 1500 });
    const contratacaoAntiga = buildCommissionSnapshot(
      calculateCommission(regraV1, money(30000)),
    );

    // Plataforma sobe a comissão: nova versão da mesma regra
    const regraV2 = rule({ id: "global", version: 2, percentBps: 1800 });
    const contratacaoNova = buildCommissionSnapshot(
      calculateCommission(regraV2, money(30000)),
    );

    expect(contratacaoAntiga.percentBps).toBe(1500);
    expect(contratacaoAntiga.commissionAmountCents).toBe(4500);
    expect(contratacaoAntiga.providerNetAmountCents).toBe(25500);

    expect(contratacaoNova.percentBps).toBe(1800);
    expect(contratacaoNova.commissionAmountCents).toBe(5400);

    // O snapshot antigo permanece intocado
    expect(contratacaoAntiga.ruleVersion).toBe(1);
  });

  it("o snapshot é imutável em runtime", () => {
    const snap = buildCommissionSnapshot(calculateCommission(rule(), money(30000)));
    expect(() => {
      (snap as { commissionAmountCents: number }).commissionAmountCents = 1;
    }).toThrow();
  });
});
