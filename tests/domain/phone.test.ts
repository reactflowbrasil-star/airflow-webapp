import { describe, expect, it } from "vitest";

import { normalizarTelefone, tentarNormalizarTelefone } from "@/domain/identity/phone";

describe("normalizarTelefone", () => {
  it("reduz todas as formas de digitar ao mesmo E.164", () => {
    const formas = [
      "(11) 98877-1200",
      "11988771200",
      "11 9 8877 1200",
      "+55 11 98877-1200",
      "5511988771200",
      "  11-98877-1200  ",
    ];

    for (const forma of formas) {
      expect(normalizarTelefone(forma).e164, forma).toBe("+5511988771200");
    }
  });

  it("devolve versão formatada e mascarada", () => {
    const t = normalizarTelefone("11988771200");

    expect(t.formatado).toBe("(11) 98877-1200");
    // A máscara mostra só os dois últimos: o suficiente para o dono reconhecer
    // o número sem entregá-lo a quem estiver olhando a tela.
    expect(t.mascarado).toBe("(11) *****-**00");
    expect(t.mascarado).not.toContain("8877");
  });

  it("recusa fixo — WhatsApp não entrega nele", () => {
    expect(() => normalizarTelefone("1133334444")).toThrow(/celular/i);
  });

  it("recusa número curto, longo ou vazio", () => {
    for (const invalido of ["", "119", "119887712000000", "abc"]) {
      expect(() => normalizarTelefone(invalido), invalido).toThrow();
    }
  });

  it("recusa DDD que não existe", () => {
    expect(() => normalizarTelefone("01988771200")).toThrow();
  });

  it("tentarNormalizarTelefone devolve null em vez de lançar", () => {
    expect(tentarNormalizarTelefone("1133334444")).toBeNull();
    expect(tentarNormalizarTelefone("11988771200")?.e164).toBe("+5511988771200");
  });
});
