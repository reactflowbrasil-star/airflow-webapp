import { describe, expect, it } from "vitest";

import { posicaoMapaPublica } from "@/domain/marketplace/search";

describe("posição pública do mapa", () => {
  it("é estável para a mesma região pública", () => {
    const chave = "São Paulo/Jardins/prestador-1";
    expect(posicaoMapaPublica(chave)).toEqual(posicaoMapaPublica(chave));
  });

  it("permanece dentro da margem segura da visualização", () => {
    for (const chave of ["A", "B", "Recife/Boa Viagem/3", "Curitiba/Centro/4"]) {
      const posicao = posicaoMapaPublica(chave);
      expect(posicao.x).toBeGreaterThanOrEqual(12);
      expect(posicao.x).toBeLessThanOrEqual(88);
      expect(posicao.y).toBeGreaterThanOrEqual(12);
      expect(posicao.y).toBeLessThanOrEqual(88);
    }
  });

  it("não depende de latitude ou longitude operacional", () => {
    const posicao = posicaoMapaPublica("Belo Horizonte/Savassi/prestador-9");
    expect(Object.keys(posicao).sort()).toEqual(["x", "y"]);
  });
});
