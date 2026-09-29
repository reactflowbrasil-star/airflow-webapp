/**
 * Catálogo do Estúdio de marketing (Higgsfield) — domínio puro, sem I/O e sem
 * Zod, para poder ser importado também pelo componente do navegador.
 *
 * Fonte de cada contrato — a documentação pública da Higgsfield não pôde ser
 * lida do ambiente onde isto foi escrito (proxy de rede), ver docs/HIGGSFIELD.md:
 *   - Sunburst: Input JSON Schema da documentação do modelo, entregue pelo dono
 *     do projeto na conversa da entrega.
 *   - Seedance 2.5: definição oficial do template higgsfield-ai/app-templates
 *     (generation/catalog/models/seedance-2.5.ts, commit 9288d98) + os
 *     parâmetros do pedido de setup (5 s, 720p, 16:9).
 */

export type SuperficieEstudio = "IMAGEM" | "VIDEO";

export const MODELO_SUNBURST = "marketing-studio/image/sunburst";
export const MODELO_SEEDANCE_25 = "bytedance/seedance-2.5/text-to-video";

export type ModeloEstudio = typeof MODELO_SUNBURST | typeof MODELO_SEEDANCE_25;

export interface DescricaoModelo {
  id: ModeloEstudio;
  superficie: SuperficieEstudio;
  rotulo: string;
  detalhe: string;
}

export const MODELOS: Readonly<Record<ModeloEstudio, DescricaoModelo>> = {
  [MODELO_SUNBURST]: {
    id: MODELO_SUNBURST,
    superficie: "IMAGEM",
    rotulo: "Marketing Studio Image",
    detalhe: "GPT Image 2.5 Sunburst — gera e edita imagens de campanha",
  },
  [MODELO_SEEDANCE_25]: {
    id: MODELO_SEEDANCE_25,
    superficie: "VIDEO",
    rotulo: "Seedance 2.5",
    detalhe: "ByteDance — vídeo a partir de texto (text-to-video)",
  },
};

export const MODELO_DA_SUPERFICIE: Readonly<Record<SuperficieEstudio, ModeloEstudio>> = {
  IMAGEM: MODELO_SUNBURST,
  VIDEO: MODELO_SEEDANCE_25,
};

export function ehModeloEstudio(valor: unknown): valor is ModeloEstudio {
  return typeof valor === "string" && Object.hasOwn(MODELOS, valor);
}

/** Enumerações e limites do Input JSON Schema do Sunburst. */
export const SUNBURST = {
  qualidades: ["low", "medium", "high", "xhigh", "max"],
  resolucoes: ["1k", "2k", "4k"],
  proporcoes: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"],
  moderacoes: ["auto", "low"],
  maxPrompt: 5000,
  /** `image_urls` no modo direto (edição): 0–16. */
  maxReferencias: 16,
  /** Com `enhance_prompt`: produto obrigatório + referência de modelo opcional. */
  maxReferenciasPreset: 2,
} as const;

/** Enumerações e limites do Seedance 2.5 text-to-video (template oficial). */
export const SEEDANCE_25 = {
  resolucoes: ["480p", "720p"],
  proporcoes: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
  bitrates: ["standard", "high"],
  duracaoMin: 4,
  duracaoMax: 30,
  /** Limite do APP: a API não documenta um para este modelo. */
  maxPrompt: 5000,
} as const;

/** Rótulos em pt-BR dos valores que a API recebe em inglês. */
export const ROTULOS_OPCAO: Readonly<Record<string, string>> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  xhigh: "Muito alta",
  max: "Máxima",
  auto: "Automática",
  standard: "Padrão",
};

export const ROTULO_MODERACAO: Readonly<Record<(typeof SUNBURST.moderacoes)[number], string>> = {
  auto: "Padrão",
  low: "Reduzida",
};

/** Tipos aceitos como imagem de referência (upload assinado da Higgsfield). */
export const TIPOS_REFERENCIA = ["image/png", "image/jpeg", "image/webp"] as const;
export type TipoReferencia = (typeof TIPOS_REFERENCIA)[number];

export function ehTipoReferencia(valor: unknown): valor is TipoReferencia {
  return typeof valor === "string" && (TIPOS_REFERENCIA as readonly string[]).includes(valor);
}

/**
 * Limite do APP para cada referência. A API não documenta um; sem teto, um
 * arquivo gigante travaria a aba do admin no upload direto ao storage.
 */
export const LIMITE_REFERENCIA_BYTES = 20 * 1024 * 1024;
