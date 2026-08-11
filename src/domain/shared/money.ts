/**
 * Money — valores monetários em CENTAVOS inteiros (§18).
 *
 * R$ 300,00 = 30000 centavos. Nunca float.
 * Todas as operações validam integridade e lançam DomainError em caso de
 * violação — dinheiro inválido não circula silenciosamente pelo sistema.
 */

import { DomainError } from "./errors";

export type Currency = "BRL";

export interface Money {
  readonly amountCents: number;
  readonly currency: Currency;
}

function assertValidAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents)) {
    throw new DomainError(
      "MONEY_INVALID_AMOUNT",
      `Valor monetário deve ser inteiro em centavos, recebido: ${amountCents}`,
    );
  }
}

export function money(amountCents: number, currency: Currency = "BRL"): Money {
  assertValidAmount(amountCents);
  return Object.freeze({ amountCents, currency });
}

export function zero(currency: Currency = "BRL"): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError(
      "MONEY_CURRENCY_MISMATCH",
      `Operação entre moedas diferentes: ${a.currency} × ${b.currency}`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents + b.amountCents, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents - b.amountCents, a.currency);
}

export function isNegative(m: Money): boolean {
  return m.amountCents < 0;
}

export function isZero(m: Money): boolean {
  return m.amountCents === 0;
}

export function isPositive(m: Money): boolean {
  return m.amountCents > 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.amountCents === b.amountCents && a.currency === b.currency;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountCents < b.amountCents) return -1;
  if (a.amountCents > b.amountCents) return 1;
  return 0;
}

/**
 * Percentual em basis points: 15% = 1500 bps.
 * Arredondamento half-up determinístico, sem ponto flutuante:
 * usa aritmética inteira pura (floor + resto).
 */
export function percentageBps(m: Money, bps: number): Money {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new DomainError(
      "MONEY_INVALID_BPS",
      `Basis points inválido: ${bps}`,
    );
  }
  const product = m.amountCents * bps;
  if (!Number.isSafeInteger(product)) {
    throw new DomainError(
      "MONEY_OVERFLOW",
      `Overflow no cálculo percentual: ${m.amountCents} × ${bps}`,
    );
  }
  const quotient = Math.floor(product / 10_000);
  const remainder = product % 10_000;
  // half-up: resto >= metade do divisor arredonda para cima
  const rounded = remainder * 2 >= 10_000 ? quotient + 1 : quotient;
  return money(rounded, m.currency);
}

/**
 * Rateia um valor em N partes proporcionais SEM criar nem destruir centavos.
 * A soma das partes é sempre exatamente igual ao total (invariante testada).
 * Sobras da divisão inteira são distribuídas um centavo por vez às primeiras
 * partes (algoritmo largest-remainder simplificado e determinístico).
 */
export function allocate(m: Money, ratios: readonly number[]): Money[] {
  if (ratios.length === 0) {
    throw new DomainError("MONEY_ALLOCATE_EMPTY", "Rateio exige ao menos uma parte");
  }
  if (ratios.some((r) => !Number.isSafeInteger(r) || r < 0)) {
    throw new DomainError(
      "MONEY_ALLOCATE_INVALID_RATIO",
      `Proporções devem ser inteiros >= 0: [${ratios.join(", ")}]`,
    );
  }
  const total = ratios.reduce((acc, r) => acc + r, 0);
  if (total === 0) {
    throw new DomainError("MONEY_ALLOCATE_ZERO_TOTAL", "Soma das proporções é zero");
  }

  const sign = m.amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(m.amountCents);

  const shares = ratios.map((r) => Math.floor((absAmount * r) / total));
  let remainder = absAmount - shares.reduce((acc, s) => acc + s, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % shares.length) {
    shares[i] += 1;
    remainder -= 1;
  }
  return shares.map((s) => money(sign * s, m.currency));
}

/** Formata para exibição pt-BR: 30000 → "R$ 300,00" */
export function formatBRL(m: Money): string {
  const value = m.amountCents / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Converte entrada de usuário "300,00" ou "300.00" para centavos, sem float. */
export function parseBRL(input: string): Money {
  const cleaned = input.replace(/\s|R\$/g, "");
  const match = /^(-?)(\d{1,13})(?:[.,](\d{1,2}))?$/.exec(
    // remove separador de milhar ("1.234,56" → "1234,56")
    cleaned.replace(/\.(?=\d{3}(\D|$))/g, ""),
  );
  if (!match) {
    throw new DomainError("MONEY_PARSE_ERROR", `Valor monetário inválido: "${input}"`);
  }
  const [, sign, intPart, decPart = ""] = match;
  const cents =
    Number.parseInt(intPart, 10) * 100 +
    Number.parseInt(decPart.padEnd(2, "0") || "0", 10);
  return money(sign === "-" ? -cents : cents);
}
