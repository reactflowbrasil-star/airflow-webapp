import { describe, expect, it } from "vitest";

import { REDACTED, redigirContato } from "@/domain/messaging/contact-guard";

/**
 * O que estes testes protegem: nenhum dado de contato pode atravessar o chat.
 * Cada caso aqui é uma forma real de tentar combinar por fora da plataforma.
 */
describe("redigirContato", () => {
  it("deixa passar mensagem legítima sem tocar no texto", () => {
    const texto = "Consigo fazer os dois splits por R$ 280,00 na quinta à tarde.";
    const r = redigirContato(texto);

    expect(r.texto).toBe(texto);
    expect(r.redigido).toBe(false);
    expect(r.padroes).toEqual([]);
  });

  it("mascara telefone em qualquer formatação", () => {
    for (const numero of [
      "(11) 98877-1200",
      "11988771200",
      "11 9 8877 1200",
      "+55 11 98877-1200",
      "98877-1200",
    ]) {
      const r = redigirContato(`me liga ${numero}`);
      expect(r.texto, numero).not.toContain("8877");
      expect(r.texto, numero).toContain(REDACTED);
      expect(r.redigido, numero).toBe(true);
    }
  });

  it("mascara e-mail e domínio", () => {
    const r = redigirContato("manda pro marina@email.com ou vê em climacerto.com.br");

    expect(r.texto).not.toContain("@email.com");
    expect(r.texto).not.toContain("climacerto");
    expect(r.padroes).toContain("email");
  });

  it("mascara menção a canal externo mesmo sem número junto", () => {
    const r = redigirContato("melhor a gente falar pelo WhatsApp");

    expect(r.texto.toLowerCase()).not.toContain("whatsapp");
    expect(r.padroes).toContain("canal-externo");
  });

  it("mascara número escrito por extenso", () => {
    const r = redigirContato("anota: um um nove oito oito sete sete um dois zero zero");

    expect(r.texto).toContain(REDACTED);
    expect(r.padroes).toContain("digitos-por-extenso");
  });

  it("mascara @perfil sem confundir com e-mail já tratado", () => {
    const r = redigirContato("me acha como @climacerto");

    expect(r.texto).not.toContain("climacerto");
    expect(r.redigido).toBe(true);
  });

  it("preserva valores em reais e quantidades", () => {
    const r = redigirContato("São 2 aparelhos de 12.000 BTUs, fecho por R$ 1.250,00");

    expect(r.texto).toContain("12.000 BTUs");
    expect(r.texto).toContain("R$ 1.250,00");
    expect(r.redigido).toBe(false);
  });

  it("preserva data e hora", () => {
    const r = redigirContato("Posso passar dia 14/08 às 14:30");

    expect(r.texto).toContain("14/08");
    expect(r.texto).toContain("14:30");
    expect(r.redigido).toBe(false);
  });

  it("colapsa redações adjacentes num único marcador", () => {
    const r = redigirContato("zap 11988771200 email a@b.com");
    const ocorrencias = r.texto.split(REDACTED).length - 1;

    expect(ocorrencias).toBeLessThanOrEqual(2);
  });

  it("nunca devolve o trecho suprimido na lista de padrões", () => {
    const r = redigirContato("meu número é (11) 98877-1200");

    expect(r.padroes.join(" ")).not.toContain("8877");
  });

  it("não carrega estado entre chamadas", () => {
    const primeira = redigirContato("liga (11) 98877-1200");
    const segunda = redigirContato("liga (11) 98877-1200");

    expect(segunda.texto).toBe(primeira.texto);
    expect(segunda.redigido).toBe(true);
  });
});
