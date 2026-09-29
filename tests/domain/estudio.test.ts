import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  MODELO_SEEDANCE_25,
  MODELO_SUNBURST,
  ehModeloEstudio,
  ehTipoReferencia,
} from "@/domain/estudio/catalogo";
import { normalizarChaveApi } from "@/domain/estudio/chave";
import {
  entradaSeedance25Schema,
  entradaSunburstSchema,
  validarEntrada,
} from "@/domain/estudio/entradas";
import {
  ENVIO_ORFAO_MS,
  envioOrfao,
  geracaoMachine,
  podeCancelar,
  proximoStatus,
  statusDaPlataforma,
} from "@/domain/estudio/geracao";
import { DomainError, InvalidTransitionError } from "@/domain/shared/errors";

const PRESET = "7e68c81e-5f97-4f48-bcab-f0d4dd75a99d";
const REF = "https://cdn.higgsfield.ai/uploads/produto.png";

describe("catálogo do Estúdio", () => {
  it("reconhece só os modelos instalados", () => {
    expect(ehModeloEstudio(MODELO_SUNBURST)).toBe(true);
    expect(ehModeloEstudio(MODELO_SEEDANCE_25)).toBe(true);
    expect(ehModeloEstudio("bytedance/seedance-2.0/text-to-video")).toBe(false);
    // Chave herdada do protótipo não é modelo.
    expect(ehModeloEstudio("constructor")).toBe(false);
  });

  it("aceita só PNG, JPEG e WebP como referência", () => {
    expect(ehTipoReferencia("image/png")).toBe(true);
    expect(ehTipoReferencia("image/webp")).toBe(true);
    expect(ehTipoReferencia("image/gif")).toBe(false);
    expect(ehTipoReferencia("video/mp4")).toBe(false);
  });
});

describe("entrada do Sunburst (Input JSON Schema)", () => {
  it("aplica os defaults documentados quando só vem o prompt", () => {
    expect(entradaSunburstSchema.parse({ prompt: "  A cinematic scene at sunset  " })).toEqual({
      prompt: "A cinematic scene at sunset",
      quality: "high",
      resolution: "2k",
      aspect_ratio: "auto",
      moderation: "auto",
      enhance_prompt: false,
    });
  });

  it("recusa campo desconhecido (additionalProperties: false)", () => {
    expect(() =>
      entradaSunburstSchema.parse({ prompt: "x", seed: 42 }),
    ).toThrow(ZodError);
  });

  it("respeita os limites do prompt e das enumerações", () => {
    expect(() => entradaSunburstSchema.parse({ prompt: "   " })).toThrow(ZodError);
    expect(() => entradaSunburstSchema.parse({ prompt: "a".repeat(5001) })).toThrow(ZodError);
    expect(entradaSunburstSchema.parse({ prompt: "a".repeat(5000) }).prompt).toHaveLength(5000);
    expect(() => entradaSunburstSchema.parse({ prompt: "x", resolution: "8k" })).toThrow(ZodError);
    expect(() => entradaSunburstSchema.parse({ prompt: "x", aspect_ratio: "5:4" })).toThrow(ZodError);
    expect(() => entradaSunburstSchema.parse({ prompt: "x", quality: "ultra" })).toThrow(ZodError);
  });

  it("edição aceita até 16 referências https — e nenhuma http", () => {
    const ok = entradaSunburstSchema.parse({ prompt: "x", image_urls: Array(16).fill(REF) });
    expect(ok.image_urls).toHaveLength(16);
    expect(() =>
      entradaSunburstSchema.parse({ prompt: "x", image_urls: Array(17).fill(REF) }),
    ).toThrow(ZodError);
    expect(() =>
      entradaSunburstSchema.parse({ prompt: "x", image_urls: ["http://cdn.exemplo.test/a.png"] }),
    ).toThrow(ZodError);
    expect(() =>
      entradaSunburstSchema.parse({ prompt: "x", image_urls: ["javascript:alert(1)"] }),
    ).toThrow(ZodError);
  });

  it("com enhance_prompt exige preset e 1–2 imagens (o if/then do schema)", () => {
    expect(() => entradaSunburstSchema.parse({ prompt: "x", enhance_prompt: true })).toThrow(ZodError);
    expect(() =>
      entradaSunburstSchema.parse({ prompt: "x", enhance_prompt: true, preset_id: PRESET }),
    ).toThrow(ZodError);
    expect(() =>
      entradaSunburstSchema.parse({
        prompt: "x",
        enhance_prompt: true,
        preset_id: PRESET,
        image_urls: [REF, REF, REF],
      }),
    ).toThrow(ZodError);
    expect(
      entradaSunburstSchema.parse({
        prompt: "Minimal, bright and premium",
        enhance_prompt: true,
        preset_id: PRESET,
        image_urls: [REF],
      }).preset_id,
    ).toBe(PRESET);
  });

  it("recusa preset que não é UUID", () => {
    expect(() =>
      entradaSunburstSchema.parse({
        prompt: "x",
        enhance_prompt: true,
        preset_id: "premium-product-ad",
        image_urls: [REF],
      }),
    ).toThrow(ZodError);
  });
});

describe("entrada do Seedance 2.5 text-to-video", () => {
  it("o pedido do setup (5 s, 720p, 16:9) passa e ganha os defaults do template", () => {
    expect(
      entradaSeedance25Schema.parse({
        prompt: "A cinematic scene at sunset",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9",
      }),
    ).toEqual({
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
      bitrate_mode: "high",
    });
  });

  it("duração inteira de 4 a 30 s; resolução só 480p/720p", () => {
    expect(() => entradaSeedance25Schema.parse({ prompt: "x", duration: 3 })).toThrow(ZodError);
    expect(() => entradaSeedance25Schema.parse({ prompt: "x", duration: 31 })).toThrow(ZodError);
    expect(() => entradaSeedance25Schema.parse({ prompt: "x", duration: 5.5 })).toThrow(ZodError);
    expect(() => entradaSeedance25Schema.parse({ prompt: "x", resolution: "1080p" })).toThrow(ZodError);
    expect(() => entradaSeedance25Schema.parse({ prompt: "x", aspect_ratio: "auto" })).toThrow(ZodError);
  });

  it("validarEntrada escolhe o schema pelo modelo", () => {
    expect(validarEntrada(MODELO_SEEDANCE_25, { prompt: "x" })).toHaveProperty("duration", 5);
    expect(validarEntrada(MODELO_SUNBURST, { prompt: "x" })).toHaveProperty("quality", "high");
    // O campo de um modelo não passa no outro.
    expect(() => validarEntrada(MODELO_SUNBURST, { prompt: "x", duration: 5 })).toThrow(ZodError);
  });
});

describe("máquina de estado da geração", () => {
  it("mapeia os estados da API e ignora o desconhecido", () => {
    expect(statusDaPlataforma("queued")).toBe("NA_FILA");
    expect(statusDaPlataforma("in_progress")).toBe("PROCESSANDO");
    expect(statusDaPlataforma("completed")).toBe("CONCLUIDA");
    expect(statusDaPlataforma("failed")).toBe("FALHOU");
    expect(statusDaPlataforma("nsfw")).toBe("BLOQUEADA");
    expect(statusDaPlataforma("canceled")).toBe("CANCELADA");
    expect(statusDaPlataforma("toString")).toBeNull();
    expect(statusDaPlataforma("paused")).toBeNull();
  });

  it("poll atrasado não faz o estado retroceder", () => {
    expect(proximoStatus("PROCESSANDO", "queued")).toBe("PROCESSANDO");
    expect(proximoStatus("CONCLUIDA", "in_progress")).toBe("CONCLUIDA");
    expect(proximoStatus("NA_FILA", "in_progress")).toBe("PROCESSANDO");
    expect(proximoStatus("NA_FILA", "canceled")).toBe("CANCELADA");
    expect(proximoStatus("NA_FILA", "algo-novo")).toBe("NA_FILA");
  });

  it("estados finais e locais não têm saída", () => {
    for (const final of ["CONCLUIDA", "FALHOU", "BLOQUEADA", "CANCELADA", "RECUSADA", "INDETERMINADA"] as const) {
      expect(geracaoMachine.isTerminal(final)).toBe(true);
    }
    expect(() => geracaoMachine.transition("INDETERMINADA", "NA_FILA")).toThrow(InvalidTransitionError);
    expect(() => geracaoMachine.transition("NA_FILA", "RECUSADA")).toThrow(InvalidTransitionError);
  });

  it("cancelar só enquanto está na fila", () => {
    expect(podeCancelar("NA_FILA")).toBe(true);
    expect(podeCancelar("PROCESSANDO")).toBe(false);
    expect(podeCancelar("ENVIANDO")).toBe(false);
  });

  it("envio preso em ENVIANDO depois do prazo fica órfão", () => {
    const criado = new Date("2026-09-28T12:00:00Z");
    const depois = (ms: number) => new Date(criado.getTime() + ms);
    expect(envioOrfao("ENVIANDO", criado, depois(ENVIO_ORFAO_MS - 1))).toBe(false);
    expect(envioOrfao("ENVIANDO", criado, depois(ENVIO_ORFAO_MS + 1))).toBe(true);
    expect(envioOrfao("NA_FILA", criado, depois(ENVIO_ORFAO_MS * 10))).toBe(false);
  });
});

describe("chave colada no Connect API key", () => {
  it("aceita a chave como copiada, com ou sem ':', tirando só as pontas", () => {
    expect(normalizarChaveApi("  key-id:key-secret\n")).toBe("key-id:key-secret");
    expect(normalizarChaveApi("hf_chave_sem_dois_pontos")).toBe("hf_chave_sem_dois_pontos");
  });

  it("recusa vazio, espaço interno, controle e o prefixo 'Key'", () => {
    for (const valor of [undefined, 42, "", "   ", "id :secret", "id:sec\r\nX-Injetado: 1", "id:\u0000sec", "Key id:secret"]) {
      expect(() => normalizarChaveApi(valor)).toThrow(DomainError);
    }
    expect(() => normalizarChaveApi("a".repeat(513))).toThrow(DomainError);
  });

  it("a mensagem de erro nunca ecoa a chave", () => {
    const segredo = "id:segredo com espaço";
    try {
      normalizarChaveApi(segredo);
      expect.unreachable();
    } catch (erro) {
      expect((erro as Error).message).not.toContain("segredo");
    }
  });
});
