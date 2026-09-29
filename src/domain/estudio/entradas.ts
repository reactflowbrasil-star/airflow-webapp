/**
 * Validação da entrada de cada modelo do Estúdio — domínio puro.
 *
 * Espelha o Input JSON Schema de cada modelo (fontes em `catalogo.ts`),
 * inclusive `additionalProperties: false`: campo desconhecido é recusado aqui
 * em vez de gastar uma requisição que a API devolveria com 422. Validar aqui
 * não substitui a validação da API — ela continua sendo a palavra final.
 */

import { z } from "zod";

import {
  MODELO_SUNBURST,
  SEEDANCE_25,
  SUNBURST,
  type ModeloEstudio,
} from "./catalogo";

const urlHttps = z.url({
  protocol: /^https$/,
  error: "Cada referência precisa ser uma URL https",
});

function promptCom(max: number) {
  return z
    .string()
    .trim()
    .min(1, "Descreva o que gerar")
    .max(max, `Use no máximo ${max} caracteres no prompt`);
}

export const entradaSunburstSchema = z
  .strictObject({
    prompt: promptCom(SUNBURST.maxPrompt),
    quality: z.enum(SUNBURST.qualidades).default("high"),
    resolution: z.enum(SUNBURST.resolucoes).default("2k"),
    aspect_ratio: z.enum(SUNBURST.proporcoes).default("auto"),
    moderation: z.enum(SUNBURST.moderacoes).default("auto"),
    enhance_prompt: z.boolean().default(false),
    // `format: uuid` no JSON Schema é mais frouxo que o z.uuid() (que exige
    // os bits de variante RFC 9562); guid aceita qualquer id 8-4-4-4-12.
    preset_id: z.guid("Preset inválido").optional(),
    image_urls: z.array(urlHttps).max(SUNBURST.maxReferencias).optional(),
  })
  .superRefine((entrada, ctx) => {
    // O `if/then` do schema: com preset, a API exige preset_id e 1–2 imagens.
    if (!entrada.enhance_prompt) return;
    if (!entrada.preset_id) {
      ctx.addIssue({
        code: "custom",
        path: ["preset_id"],
        message: "Escolha um preset do Marketing Studio",
      });
    }
    const imagens = entrada.image_urls?.length ?? 0;
    if (imagens < 1 || imagens > SUNBURST.maxReferenciasPreset) {
      ctx.addIssue({
        code: "custom",
        path: ["image_urls"],
        message:
          "Com preset, envie a imagem do produto e, se quiser, uma referência de modelo (1 ou 2 imagens)",
      });
    }
  });

export const entradaSeedance25Schema = z.strictObject({
  prompt: promptCom(SEEDANCE_25.maxPrompt),
  duration: z
    .number()
    .int("Duração em segundos inteiros")
    .min(SEEDANCE_25.duracaoMin)
    .max(SEEDANCE_25.duracaoMax)
    .default(5),
  resolution: z.enum(SEEDANCE_25.resolucoes).default("720p"),
  aspect_ratio: z.enum(SEEDANCE_25.proporcoes).default("16:9"),
  generate_audio: z.boolean().default(true),
  bitrate_mode: z.enum(SEEDANCE_25.bitrates).default("high"),
});

export type EntradaSunburst = z.output<typeof entradaSunburstSchema>;
export type EntradaSeedance25 = z.output<typeof entradaSeedance25Schema>;
export type EntradaModelo = EntradaSunburst | EntradaSeedance25;

/**
 * Valida e normaliza (aplica os defaults do schema). Lança ZodError — a borda
 * HTTP transforma em 422 com os campos.
 */
export function validarEntrada(modelo: ModeloEstudio, entrada: unknown): EntradaModelo {
  return modelo === MODELO_SUNBURST
    ? entradaSunburstSchema.parse(entrada)
    : entradaSeedance25Schema.parse(entrada);
}
