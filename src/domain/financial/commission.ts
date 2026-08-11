/**
 * Commission Engine (§20).
 *
 * Resolve qual regra se aplica a uma ordem, calcula a comissão em centavos
 * e produz o snapshot imutável (§19) que congela a regra no momento do aceite.
 *
 * Domínio puro: recebe as regras candidatas como dados, não consulta banco.
 */

import { FinancialInvariantError } from "../shared/errors";
import { money, percentageBps, type Money } from "../shared/money";

export type CommissionScope =
  | "PROVIDER"
  | "PROMOTIONAL"
  | "CAMPAIGN"
  | "CITY"
  | "CATEGORY"
  | "PLAN"
  | "GLOBAL";

/**
 * Precedência (§20): menor número vence.
 * PROVIDER → PROMOTIONAL/CAMPAIGN → CITY → CATEGORY → PLAN → GLOBAL
 */
const SCOPE_PRECEDENCE: Record<CommissionScope, number> = {
  PROVIDER: 1,
  PROMOTIONAL: 2,
  CAMPAIGN: 2,
  CITY: 3,
  CATEGORY: 4,
  PLAN: 5,
  GLOBAL: 6,
};

export interface CommissionRuleData {
  id: string;
  name: string;
  scope: CommissionScope;
  /** 15% = 1500 bps */
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
}

export interface CommissionContext {
  providerId: string;
  categoryId: string;
  cityId: string | null;
  planCode: string | null;
  campaignCodes: readonly string[];
  at: Date;
}

export interface CommissionResult {
  rule: CommissionRuleData;
  grossAmount: Money;
  discount: Money;
  commissionAmount: Money;
  providerNetAmount: Money;
}

function ruleMatchesContext(rule: CommissionRuleData, ctx: CommissionContext): boolean {
  if (!rule.active) return false;
  if (rule.validFrom.getTime() > ctx.at.getTime()) return false;
  if (rule.validTo !== null && rule.validTo.getTime() < ctx.at.getTime()) return false;

  switch (rule.scope) {
    case "PROVIDER":
      return rule.providerId === ctx.providerId;
    case "PROMOTIONAL":
    case "CAMPAIGN":
      return (
        rule.campaignCode !== null && ctx.campaignCodes.includes(rule.campaignCode)
      );
    case "CITY":
      return rule.cityId !== null && rule.cityId === ctx.cityId;
    case "CATEGORY":
      return rule.categoryId === ctx.categoryId;
    case "PLAN":
      return rule.planCode !== null && rule.planCode === ctx.planCode;
    case "GLOBAL":
      return true;
  }
}

/**
 * Seleção determinística (§20):
 *   1. precedência de escopo;
 *   2. priority explícita (maior vence);
 *   3. validFrom mais recente;
 *   4. id (estabilidade total do desempate).
 */
export function resolveCommissionRule(
  rules: readonly CommissionRuleData[],
  ctx: CommissionContext,
): CommissionRuleData | null {
  const candidates = rules.filter((r) => ruleMatchesContext(r, ctx));
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const byScope = SCOPE_PRECEDENCE[a.scope] - SCOPE_PRECEDENCE[b.scope];
    if (byScope !== 0) return byScope;
    const byPriority = b.priority - a.priority;
    if (byPriority !== 0) return byPriority;
    const byDate = b.validFrom.getTime() - a.validFrom.getTime();
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
  return sorted[0];
}

/**
 * Calcula a comissão de uma ordem aplicando uma regra já resolvida.
 * Invariantes:
 *   - comissão nunca negativa e nunca maior que o valor bruto;
 *   - bruto = comissão + líquido, sempre (nenhum centavo some).
 */
export function calculateCommission(
  rule: CommissionRuleData,
  grossAmount: Money,
  discount: Money = money(0),
): CommissionResult {
  if (grossAmount.amountCents <= 0) {
    throw new FinancialInvariantError(
      "COMMISSION_INVALID_GROSS",
      `Valor bruto deve ser positivo: ${grossAmount.amountCents}`,
    );
  }
  if (discount.amountCents < 0 || discount.amountCents > grossAmount.amountCents) {
    throw new FinancialInvariantError(
      "COMMISSION_INVALID_DISCOUNT",
      `Desconto fora do intervalo válido: ${discount.amountCents}`,
    );
  }

  const base = money(grossAmount.amountCents - discount.amountCents);
  let commission = percentageBps(base, rule.percentBps);
  commission = money(commission.amountCents + rule.fixedFeeCents);

  if (rule.minCommissionCents !== null && commission.amountCents < rule.minCommissionCents) {
    commission = money(rule.minCommissionCents);
  }
  if (rule.maxCommissionCents !== null && commission.amountCents > rule.maxCommissionCents) {
    commission = money(rule.maxCommissionCents);
  }
  // Comissão nunca excede a base — o prestador nunca fica devendo pelo serviço
  if (commission.amountCents > base.amountCents) {
    commission = money(base.amountCents);
  }
  if (commission.amountCents < 0) {
    throw new FinancialInvariantError(
      "COMMISSION_NEGATIVE",
      `Comissão negativa calculada pela regra ${rule.id}`,
    );
  }

  const providerNet = money(base.amountCents - commission.amountCents);

  // Invariante de conservação: base = comissão + líquido
  if (commission.amountCents + providerNet.amountCents !== base.amountCents) {
    throw new FinancialInvariantError(
      "COMMISSION_CONSERVATION_VIOLATED",
      "Soma de comissão e líquido difere da base",
      {
        baseCents: base.amountCents,
        commissionCents: commission.amountCents,
        netCents: providerNet.amountCents,
      },
    );
  }

  return {
    rule,
    grossAmount,
    discount,
    commissionAmount: commission,
    providerNetAmount: providerNet,
  };
}

/**
 * Snapshot financeiro imutável (§19): congela regra + valores no aceite.
 * Ordens antigas continuam regidas pela regra original para sempre.
 */
export interface CommissionSnapshotData {
  ruleId: string;
  ruleScope: CommissionScope;
  ruleVersion: number;
  ruleName: string;
  grossAmountCents: number;
  percentBps: number;
  fixedFeeCents: number;
  minCommissionCents: number | null;
  maxCommissionCents: number | null;
  discountCents: number;
  commissionAmountCents: number;
  providerNetAmountCents: number;
  currency: string;
  /** Cópia literal da regra para auditoria (§44) */
  ruleSnapshot: Record<string, unknown>;
}

export function buildCommissionSnapshot(result: CommissionResult): CommissionSnapshotData {
  const { rule } = result;
  return Object.freeze({
    ruleId: rule.id,
    ruleScope: rule.scope,
    ruleVersion: rule.version,
    ruleName: rule.name,
    grossAmountCents: result.grossAmount.amountCents,
    percentBps: rule.percentBps,
    fixedFeeCents: rule.fixedFeeCents,
    minCommissionCents: rule.minCommissionCents,
    maxCommissionCents: rule.maxCommissionCents,
    discountCents: result.discount.amountCents,
    commissionAmountCents: result.commissionAmount.amountCents,
    providerNetAmountCents: result.providerNetAmount.amountCents,
    currency: result.grossAmount.currency,
    ruleSnapshot: {
      id: rule.id,
      name: rule.name,
      scope: rule.scope,
      percentBps: rule.percentBps,
      fixedFeeCents: rule.fixedFeeCents,
      minCommissionCents: rule.minCommissionCents,
      maxCommissionCents: rule.maxCommissionCents,
      priority: rule.priority,
      version: rule.version,
      validFrom: rule.validFrom.toISOString(),
      validTo: rule.validTo?.toISOString() ?? null,
    },
  });
}
