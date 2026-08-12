import { describe, expect, it } from "vitest";

import { serializarPropriedades } from "@/server/services/analytics-service";

/**
 * O teste do funil (§60) fica no lado puro: `serializarPropriedades` é o que
 * garante que o payload gravado é JSON válido e sem lixo. A escrita em si é
 * best-effort e exige banco — o contrato que dá para verificar sem banco é
 * exatamente este.
 */
describe("Analytics §60 — serialização do payload", () => {
  it("descarta undefined, que o JSON não carrega", () => {
    expect(
      serializarPropriedades({ orderId: "o1", metodo: undefined }),
    ).toEqual({ orderId: "o1" });
  });

  it("converte Date para ISO", () => {
    const data = new Date("2026-08-12T12:00:00.000Z");
    expect(serializarPropriedades({ quando: data })).toEqual({
      quando: "2026-08-12T12:00:00.000Z",
    });
  });

  it("mantém números, strings, booleanos e arrays intactos", () => {
    const propriedades = {
      amountCents: 30000,
      rotulo: "PIX",
      pago: true,
      tags: ["a", "b"],
    };
    expect(serializarPropriedades(propriedades)).toEqual(propriedades);
  });

  it("devolve objeto vazio para entrada vazia ou undefined", () => {
    expect(serializarPropriedades()).toEqual({});
    expect(serializarPropriedades({})).toEqual({});
  });

  it("não altera a entrada original", () => {
    const entrada = { amountCents: 1000, quando: new Date("2026-01-01T00:00:00Z") };
    const copia = { ...entrada };
    serializarPropriedades(entrada);
    expect(entrada).toEqual(copia);
  });
});
