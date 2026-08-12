import { describe, expect, it } from "vitest";

import {
  confirmarCodigoSchema,
  loginSchema,
  registerSchema,
} from "@/lib/validation/auth";
import {
  createProposalSchema,
  createRequestSchema,
  searchProvidersSchema,
} from "@/lib/validation/marketplace";

/**
 * Validação server-side (§57): nunca confiar no frontend. Estes testes fixam
 * o contrato dos schemas que guardam a entrada de todos os fluxos.
 */
describe("registerSchema — cadastro", () => {
  it("aceita cadastro válido e aplica defaults", () => {
    const resultado = registerSchema.parse({
      name: "Ana Souza",
      email: "ANA@exemplo.com ",
      phone: "(11) 98877-1200",
      password: "senha1234",
      acceptTerms: true,
    });
    expect(resultado.email).toBe("ana@exemplo.com");
    expect(resultado.role).toBe("CUSTOMER");
    expect(resultado.marketingConsent).toBe(false);
  });

  it("recusa senha sem letra ou sem número", () => {
    expect(() =>
      registerSchema.parse({
        name: "Ana",
        email: "ana@exemplo.com",
        phone: "(11) 98877-1200",
        password: "12345678",
        acceptTerms: true,
      }),
    ).toThrow();
    expect(() =>
      registerSchema.parse({
        name: "Ana",
        email: "ana@exemplo.com",
        phone: "(11) 98877-1200",
        password: "abcdefgh",
        acceptTerms: true,
      }),
    ).toThrow();
  });

  it("recusa termos não aceitos", () => {
    expect(() =>
      registerSchema.parse({
        name: "Ana",
        email: "ana@exemplo.com",
        phone: "(11) 98877-1200",
        password: "senha1234",
        acceptTerms: false,
      }),
    ).toThrow(/termos/i);
  });

  it("recusa e-mail malformado", () => {
    expect(() =>
      registerSchema.parse({
        name: "Ana",
        email: "nao-e-email",
        phone: "(11) 98877-1200",
        password: "senha1234",
        acceptTerms: true,
      }),
    ).toThrow();
  });
});

describe("loginSchema — mensagem de erro única (não-oráculo)", () => {
  it("exige e-mail e senha presentes", () => {
    expect(() => loginSchema.parse({ email: "ana@exemplo.com" })).toThrow();
    expect(() => loginSchema.parse({ password: "x" })).toThrow();
  });
});

describe("createRequestSchema — solicitação (§12)", () => {
  const base = {
    categoryId: "cat-1",
    addressId: "end-1",
    equipmentType: "SPLIT",
    quantity: 1,
    description: "Meu ar não está gelando e faz barulho estranho",
    proposedPriceCents: 30000,
  };

  it("aceita valores válidos", () => {
    expect(createRequestSchema.parse(base).proposedPriceCents).toBe(30000);
  });

  it("recusa descrição curta demais", () => {
    expect(() =>
      createRequestSchema.parse({ ...base, description: "curta" }),
    ).toThrow(/10 caracteres/);
  });

  it("recusa valor proposto não positivo", () => {
    expect(() =>
      createRequestSchema.parse({ ...base, proposedPriceCents: 0 }),
    ).toThrow();
    expect(() =>
      createRequestSchema.parse({ ...base, proposedPriceCents: -5 }),
    ).toThrow();
  });

  it("recusa quantidade fora da faixa", () => {
    expect(() =>
      createRequestSchema.parse({ ...base, quantity: 0 }),
    ).toThrow();
    expect(() =>
      createRequestSchema.parse({ ...base, quantity: 99 }),
    ).toThrow();
  });

  it("aceita string monetária \"R$ 1.234,56\" e converte para centavos", () => {
    const resultado = createRequestSchema.parse({
      ...base,
      proposedPriceCents: "R$ 1.234,56",
    });
    expect(resultado.proposedPriceCents).toBe(123456);
  });

  it("aceita \"280,00\" e \"280\" como 28000 centavos", () => {
    expect(
      createRequestSchema.parse({ ...base, proposedPriceCents: "280,00" })
        .proposedPriceCents,
    ).toBe(28000);
    expect(
      createRequestSchema.parse({ ...base, proposedPriceCents: "280" })
        .proposedPriceCents,
    ).toBe(28000);
  });
});

describe("createProposalSchema — proposta (§14)", () => {
  it("aceita valor em string e converte para centavos", () => {
    const resultado = createProposalSchema.parse({
      requestId: "req-1",
      providerId: "prov-1",
      amountCents: "450,50",
    });
    expect(resultado.amountCents).toBe(45050);
  });

  it("recusa mensagem acima do limite", () => {
    expect(() =>
      createProposalSchema.parse({
        requestId: "req-1",
        providerId: "prov-1",
        amountCents: 1000,
        message: "x".repeat(1001),
      }),
    ).toThrow();
  });
});

describe("searchProvidersSchema — busca (§11)", () => {
  it("aplica defaults e coage tipos da query string", () => {
    const resultado = searchProvidersSchema.parse({
      q: "limpeza",
      notaMin: "4.5",
      emergencia: "true",
      pagina: "3",
    });
    expect(resultado.ordenar).toBe("recomendados");
    expect(resultado.pagina).toBe(3);
    expect(resultado.notaMin).toBe(4.5);
    expect(resultado.emergencia).toBe(true);
  });

  it("recusa nota fora de 0–5 e página zero", () => {
    expect(() => searchProvidersSchema.parse({ notaMin: "6" })).toThrow();
    expect(() => searchProvidersSchema.parse({ notaMin: "-1" })).toThrow();
    expect(() => searchProvidersSchema.parse({ pagina: "0" })).toThrow();
  });
});

describe("confirmarCodigoSchema — verificação", () => {
  it("aceita código de 6 dígitos e recusa curto demais", () => {
    expect(confirmarCodigoSchema.parse({ codigo: "123456" })).toEqual({
      codigo: "123456",
    });
    expect(() => confirmarCodigoSchema.parse({ codigo: "123" })).toThrow();
  });
});
