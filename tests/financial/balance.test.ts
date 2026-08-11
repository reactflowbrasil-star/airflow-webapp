import { describe, expect, it } from "vitest";

import {
  EMPTY_BALANCE,
  blockForDispute,
  creditPending,
  forfeitBlocked,
  moveToTransit,
  releasePendingToAvailable,
  returnTransitToAvailable,
  settleTransit,
  totalCents,
  unblockToAvailable,
} from "@/domain/financial/balance";
import { FinancialInvariantError } from "@/domain/shared/errors";

describe("Saldos segregados (§22)", () => {
  it("começa zerado nas quatro categorias", () => {
    expect(EMPTY_BALANCE).toEqual({
      pendingCents: 0,
      availableCents: 0,
      blockedCents: 0,
      inTransitCents: 0,
    });
  });

  it("liquidação credita como PENDENTE, não como disponível", () => {
    const b = creditPending(EMPTY_BALANCE, 25500);
    expect(b.pendingCents).toBe(25500);
    expect(b.availableCents).toBe(0);
  });

  it("janela de segurança move pendente → disponível (§29)", () => {
    let b = creditPending(EMPTY_BALANCE, 25500);
    b = releasePendingToAvailable(b, 25500);
    expect(b.pendingCents).toBe(0);
    expect(b.availableCents).toBe(25500);
  });

  it("repasse move disponível → em repasse → liquidado", () => {
    let b = releasePendingToAvailable(creditPending(EMPTY_BALANCE, 25500), 25500);
    b = moveToTransit(b, 25500);
    expect(b.availableCents).toBe(0);
    expect(b.inTransitCents).toBe(25500);

    b = settleTransit(b, 25500);
    expect(b.inTransitCents).toBe(0);
    expect(totalCents(b)).toBe(0);
  });

  it("falha de repasse devolve o valor para disponível (§28)", () => {
    let b = moveToTransit(
      releasePendingToAvailable(creditPending(EMPTY_BALANCE, 10000), 10000),
      10000,
    );
    b = returnTransitToAvailable(b, 10000);
    expect(b.availableCents).toBe(10000);
    expect(b.inTransitCents).toBe(0);
  });

  it("disputa bloqueia primeiro do pendente e depois do disponível (§33)", () => {
    let b = creditPending(EMPTY_BALANCE, 10000);
    b = releasePendingToAvailable(b, 6000); // pending=4000, available=6000
    b = blockForDispute(b, 9000);

    expect(b.pendingCents).toBe(0);
    expect(b.availableCents).toBe(1000);
    expect(b.blockedCents).toBe(9000);
    expect(totalCents(b)).toBe(10000);
  });

  it("disputa vencida pelo prestador libera o bloqueado", () => {
    let b = blockForDispute(creditPending(EMPTY_BALANCE, 10000), 10000);
    b = unblockToAvailable(b, 10000);
    expect(b.blockedCents).toBe(0);
    expect(b.availableCents).toBe(10000);
  });

  it("disputa vencida pelo cliente retira o bloqueado do prestador", () => {
    let b = blockForDispute(creditPending(EMPTY_BALANCE, 10000), 10000);
    b = forfeitBlocked(b, 10000);
    expect(b.blockedCents).toBe(0);
    expect(totalCents(b)).toBe(0);
  });
});

describe("Saldos — proteções contra saque indevido", () => {
  it("impede sacar mais do que o disponível", () => {
    const b = releasePendingToAvailable(creditPending(EMPTY_BALANCE, 10000), 10000);
    expect(() => moveToTransit(b, 10001)).toThrow(FinancialInvariantError);
  });

  it("impede liberar mais do que o pendente", () => {
    const b = creditPending(EMPTY_BALANCE, 5000);
    expect(() => releasePendingToAvailable(b, 5001)).toThrow(FinancialInvariantError);
  });

  it("impede saque duplo do mesmo valor", () => {
    let b = releasePendingToAvailable(creditPending(EMPTY_BALANCE, 25500), 25500);
    b = moveToTransit(b, 25500);
    // Segunda tentativa: não há mais disponível
    expect(() => moveToTransit(b, 25500)).toThrow(FinancialInvariantError);
  });

  it("impede desbloquear valor inexistente", () => {
    expect(() => unblockToAvailable(EMPTY_BALANCE, 100)).toThrow(FinancialInvariantError);
  });

  it("rejeita valores não positivos em qualquer operação", () => {
    expect(() => creditPending(EMPTY_BALANCE, 0)).toThrow(FinancialInvariantError);
    expect(() => creditPending(EMPTY_BALANCE, -100)).toThrow(FinancialInvariantError);
    expect(() => moveToTransit(EMPTY_BALANCE, 1.5)).toThrow(FinancialInvariantError);
  });

  it("preserva o total em toda transferência entre categorias", () => {
    let b = creditPending(EMPTY_BALANCE, 100000);
    expect(totalCents(b)).toBe(100000);
    b = releasePendingToAvailable(b, 40000);
    expect(totalCents(b)).toBe(100000);
    b = blockForDispute(b, 30000);
    expect(totalCents(b)).toBe(100000);
    b = unblockToAvailable(b, 30000);
    expect(totalCents(b)).toBe(100000);
    b = moveToTransit(b, 40000);
    expect(totalCents(b)).toBe(100000);
  });
});
