import { z } from "zod";

import {
  LIMITE_PROMPT,
  LIMITE_REFERENCIAS,
  LIMITE_REFERENCIAS_PRESET,
  PROPORCOES_IMAGEM,
  QUALIDADES_IMAGEM,
  RESOLUCOES_IMAGEM,
} from "@/lib/marketing-image";

/**
 * Pedido de imagem ao Marketing Studio (Higgsfield — GPT Image 2.5 Sunburst).
 *
 * Espelha o JSON Schema que o provedor publica para o modelo
 * `marketing-studio/image/sunburst` e é validado AQUI, antes de a requisição
 * paga sair do servidor (§57): um 422 do provedor custa uma ida e volta e
 * chega em inglês; o nosso chega em português apontando o campo.
 *
 * Os nomes são nossos; a tradução para o corpo do provedor (`aspect_ratio`,
 * `image_urls`, `enhance_prompt`…) vive só no adapter — trocar de fornecedor
 * não muda esta fronteira.
 */

/**
 * Link de imagem de referência. Só https: quem baixa a imagem é o provedor, e
 * um `http://` ou `data:` seria recusado lá depois de a requisição já ter
 * saído — melhor recusar aqui, dizendo o que fazer.
 */
const linkDeImagem = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https$/, error: "Use um link público https para cada imagem" }));

export const pedidoImagemMarketingSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, "Descreva a imagem que você quer")
      .max(LIMITE_PROMPT, `O prompt passa de ${LIMITE_PROMPT} caracteres`),
    qualidade: z.enum(QUALIDADES_IMAGEM).default("high"),
    resolucao: z.enum(RESOLUCOES_IMAGEM).default("2k"),
    proporcao: z.enum(PROPORCOES_IMAGEM).default("auto"),
    imagens: z
      .array(linkDeImagem)
      .max(LIMITE_REFERENCIAS, `No máximo ${LIMITE_REFERENCIAS} imagens de referência`)
      .default([]),
    /** `enhance_prompt` do provedor: aplica um preset do Marketing Studio. */
    aprimorar: z.boolean().default(false),
    // guid e não uuid: o formato é o de UUID (8-4-4-4-12), mas o id vem do
    // catálogo do provedor e não cabe a nós recusá-lo por versão RFC.
    presetId: z.guid("Preset inválido").optional(),
  })
  .superRefine((pedido, ctx) => {
    if (!pedido.aprimorar) return;
    if (!pedido.presetId) {
      ctx.addIssue({
        code: "custom",
        path: ["presetId"],
        message: "Escolha um preset do Marketing Studio",
      });
    }
    if (pedido.imagens.length < 1 || pedido.imagens.length > LIMITE_REFERENCIAS_PRESET) {
      ctx.addIssue({
        code: "custom",
        path: ["imagens"],
        message:
          "O modo com preset usa o link da imagem do produto e, se quiser, o de uma imagem do modelo",
      });
    }
  })
  // Preset só significa algo no modo aprimorado; fora dele, descartar aqui
  // evita que auditoria e adapter tenham de lembrar a regra cada um.
  .transform((pedido) => (pedido.aprimorar ? pedido : { ...pedido, presetId: undefined }));

export type PedidoImagemMarketing = z.output<typeof pedidoImagemMarketingSchema>;

/** Id de geração vindo da URL: só o formato de UUID chega ao provedor. */
export const requestIdSchema = z.guid();

/** Cursor opaco da paginação de presets — repassado, nunca interpretado. */
export const cursorPresetsSchema = z.string().trim().min(1).max(512).optional();
