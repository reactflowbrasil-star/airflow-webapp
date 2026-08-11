import { describe, expect, it } from "vitest";

import {
  add,
  allocate,
  formatBRL,
  money,
  parseBRL,
  percentageBps,
  subtract,
} from "@/domain/shared/money";
import { DomainError } from "@/domain/shared/errors";

describe("Money — centavos inteiros (§18)", () => {
  it("rejeita valores não inteiros", () => {
    expect(() => money(300.5)).toThrow(DomainError);
    expect(() => money(Number.NaN)).toThrow(DomainError);
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(DomainError);
  });

  it("aceita zero e negativos (estornos)", () => {
    expect(money(0).amountCents).toBe(0);
    expect(money(-25500).amountCents).toBe(-25500);
  });

  it("soma e subtrai sem erro de ponto flutuante", () => {
    // 0.1 + 0.2 !== 0.3 em float; em centavos é exato
    expect(add(money(10), money(20)).amountCents).toBe(30);
    expect(subtract(money(30000), money(4500)).amountCents).toBe(25500);
  });

  it("recusa operação entre moedas diferentes", () => {
    const brl = money(100, "BRL");
    const outra = { amountCents: 100, currency: "USD" } as unknown as typeof brl;
    expect(() => add(brl, outra)).toThrow(/moedas diferentes/);
  });
});

describe("percentageBps — arredondamento determinístico", () => {
  it("calcula 15% de R$ 300,00 como R$ 45,00", () => {
    expect(percentageBps(money(30000), 1500).amountCents).toBe(4500);
  });

  it("arredonda half-up de forma previsível", () => {
    // 10% de 1 centavo = 0,1 → arredonda para 0
    expect(percentageBps(money(1), 1000).amountCents).toBe(0);
    // 50% de 1 centavo = 0,5 → half-up → 1
    expect(percentageBps(money(1), 5000).amountCents).toBe(1);
    // 15% de 3333 = 499,95 → 500
    expect(percentageBps(money(3333), 1500).amountCents).toBe(500);
  });

  it("é estável para todos os valores de 1 a 2000 centavos", () => {
    for (let cents = 1; cents <= 2000; cents++) {
      const result = percentageBps(money(cents), 1500).amountCents;
      expect(Number.isSafeInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(cents);
    }
  });

  it("rejeita bps inválido", () => {
    expect(() => percentageBps(money(100), -1)).toThrow(DomainError);
    expect(() => percentageBps(money(100), 15.5)).toThrow(DomainError);
  });
});

describe("allocate — rateio sem perder centavos", () => {
  it("distribui R$ 100,00 em 3 partes iguais sem sumir com centavo", () => {
    const parts = allocate(money(10000), [1, 1, 1]);
    expect(parts.map((p) => p.amountCents)).toEqual([3334, 3333, 3333]);
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(10000);
  });

  it("respeita proporções desiguais", () => {
    const parts = allocate(money(10000), [7, 3]);
    expect(parts.map((p) => p.amountCents)).toEqual([7000, 3000]);
  });

  it("preserva o total para qualquer valor e divisor (invariante)", () => {
    for (let total = 1; total <= 500; total++) {
      for (const ratios of [[1, 1], [1, 1, 1], [2, 3, 5], [1, 7]]) {
        const parts = allocate(money(total), ratios);
        const sum = parts.reduce((s, p) => s + p.amountCents, 0);
        expect(sum).toBe(total);
      }
    }
  });

  it("mantém o sinal em valores negativos", () => {
    const parts = allocate(money(-10000), [1, 1, 1]);
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(-10000);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => allocate(money(100), [])).toThrow(DomainError);
    expect(() => allocate(money(100), [0, 0])).toThrow(DomainError);
    expect(() => allocate(money(100), [-1, 2])).toThrow(DomainError);
  });
});

describe("formatação e parsing pt-BR", () => {
  it("formata em real brasileiro", () => {
    //   = espaço não separável usado pelo Intl
    expect(formatBRL(money(30000)).replace(/ /g, " ")).toBe("R$ 300,00");
    expect(formatBRL(money(4500)).replace(/ /g, " ")).toBe("R$ 45,00");
  });

  it("converte entrada do usuário para centavos", () => {
    expect(parseBRL("300,00").amountCents).toBe(30000);
    expect(parseBRL("300").amountCents).toBe(30000);
    expect(parseBRL("R$ 1.234,56").amountCents).toBe(123456);
    expect(parseBRL("0,05").amountCents).toBe(5);
  });

  it("rejeita entrada malformada", () => {
    expect(() => parseBRL("abc")).toThrow(DomainError);
    expect(() => parseBRL("")).toThrow(DomainError);
    expect(() => parseBRL("10,999")).toThrow(DomainError);
  });
});
