import { describe, expect, it } from "vitest";

import {
  LIMITE_SELFIE_BYTES,
  mapResultadoBiometria,
  motivoRejeicao,
  podeTransitar,
  selfieAceita,
} from "@/domain/verification/facial";

function dataUrl(tamanhoBytes: number, formato = "jpeg"): string {
  const base64 = "A".repeat(Math.ceil((tamanhoBytes * 4) / 3));
  return `data:image/${formato};base64,${base64}`;
}

describe("facial — máquina de estados", () => {
  it("NAO_INICIADA só abre sessão", () => {
    expect(podeTransitar("NAO_INICIADA", "SESSAO_CRIADA")).toBe(true);
    expect(podeTransitar("NAO_INICIADA", "APROVADA")).toBe(false);
  });

  it("SESSAO_CRIADA aprova ou reprova", () => {
    expect(podeTransitar("SESSAO_CRIADA", "APROVADA")).toBe(true);
    expect(podeTransitar("SESSAO_CRIADA", "REPROVADA")).toBe(true);
  });

  it("APROVADA é terminal — não volta", () => {
    expect(podeTransitar("APROVADA", "SESSAO_CRIADA")).toBe(false);
    expect(podeTransitar("APROVADA", "REPROVADA")).toBe(false);
  });

  it("REPROVADA permite nova tentativa", () => {
    expect(podeTransitar("REPROVADA", "SESSAO_CRIADA")).toBe(true);
  });
});

describe("facial — regras da selfie", () => {
  it("aceita JPEG dentro do limite", () => {
    expect(selfieAceita(dataUrl(500_000))).toBe(true);
    expect(motivoRejeicao(dataUrl(500_000))).toBeNull();
  });

  it("recusa formato não suportado", () => {
    expect(selfieAceita("data:image/gif;base64,AAAA")).toBe(false);
    expect(motivoRejeicao("data:image/gif;base64,AAAA")).toContain("Formato");
  });

  it("recusa acima do limite", () => {
    expect(selfieAceita(dataUrl(LIMITE_SELFIE_BYTES + 1))).toBe(false);
    expect(motivoRejeicao(dataUrl(LIMITE_SELFIE_BYTES + 1))).toContain("grande");
  });

  it("recusa texto que não é data URL de imagem", () => {
    expect(selfieAceita("https://exemplo.com/foto.jpg")).toBe(false);
  });
});

describe("facial — mapeamento do resultado", () => {
  it("aprovado vira estado APROVADA sem motivo", () => {
    const r = mapResultadoBiometria({ aprovado: true, score: 0.97 });
    expect(r).toEqual({ estado: "APROVADA", motivo: null });
  });

  it("reprovado com motivo preserva o motivo", () => {
    const r = mapResultadoBiometria({
      aprovado: false,
      motivo: "Liveness não detectada",
    });
    expect(r).toEqual({ estado: "REPROVADA", motivo: "Liveness não detectada" });
  });

  it("reprovado sem motivo usa mensagem padrão não-oráculo", () => {
    const r = mapResultadoBiometria({ aprovado: false });
    expect(r.estado).toBe("REPROVADA");
    expect(r.motivo).toContain("confirmar sua identidade");
  });
});
