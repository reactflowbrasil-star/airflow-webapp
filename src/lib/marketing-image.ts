/**
 * Vocabulário do estúdio de marketing, compartilhado entre servidor e tela.
 *
 * Os status são nossos, não os do Higgsfield: o adapter traduz `queued`,
 * `in_progress`, `completed`, `failed`, `nsfw` e `canceled` para estes, e a
 * tela nunca vê a palavra do fornecedor — trocar de provedor não muda a UI.
 *
 * Puro e sem Zod de propósito: a tela importa daqui, e o schema (em
 * `validation/marketing.ts`) importa estas listas — o bundle do navegador
 * não ganha o Zod por causa de três enums.
 */

/** Valores aceitos pelo modelo (JSON Schema do provedor). */
export const QUALIDADES_IMAGEM = ["low", "medium", "high", "xhigh", "max"] as const;
export const RESOLUCOES_IMAGEM = ["1k", "2k", "4k"] as const;
export const PROPORCOES_IMAGEM = [
  "auto",
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "21:9",
] as const;

export type QualidadeImagem = (typeof QUALIDADES_IMAGEM)[number];
export type ResolucaoImagem = (typeof RESOLUCOES_IMAGEM)[number];
export type ProporcaoImagem = (typeof PROPORCOES_IMAGEM)[number];

export const LIMITE_PROMPT = 5000;
export const LIMITE_REFERENCIAS = 16;
/** Modo com preset: a imagem do produto e, opcionalmente, a do modelo. */
export const LIMITE_REFERENCIAS_PRESET = 2;

export const ROTULO_QUALIDADE: Record<QualidadeImagem, string> = {
  low: "Baixa — rascunho",
  medium: "Média",
  high: "Alta (padrão)",
  xhigh: "Muito alta",
  max: "Máxima",
};

export const ROTULO_RESOLUCAO: Record<ResolucaoImagem, string> = {
  "1k": "1k — rascunho",
  "2k": "2k (padrão)",
  "4k": "4k — impressão",
};

export const ROTULO_PROPORCAO: Record<ProporcaoImagem, string> = {
  auto: "Automática",
  "1:1": "1:1 — quadrado (feed)",
  "3:2": "3:2 — paisagem",
  "2:3": "2:3 — retrato",
  "4:3": "4:3 — paisagem",
  "3:4": "3:4 — retrato (feed)",
  "16:9": "16:9 — banner e vídeo",
  "9:16": "9:16 — stories e reels",
  "21:9": "21:9 — capa larga",
};

export const STATUS_GERACAO = [
  "NA_FILA",
  "GERANDO",
  "CONCLUIDA",
  "FALHOU",
  "BLOQUEADA",
  "CANCELADA",
] as const;

export type StatusGeracao = (typeof STATUS_GERACAO)[number];

const TERMINAIS: ReadonlySet<StatusGeracao> = new Set([
  "CONCLUIDA",
  "FALHOU",
  "BLOQUEADA",
  "CANCELADA",
]);

/** Depois de um status terminal o provedor não muda mais nada: parar o polling. */
export function geracaoTerminou(status: StatusGeracao): boolean {
  return TERMINAIS.has(status);
}

export const ROTULO_STATUS: Record<StatusGeracao, string> = {
  NA_FILA: "Na fila",
  GERANDO: "Gerando",
  CONCLUIDA: "Pronta",
  FALHOU: "Falhou",
  BLOQUEADA: "Bloqueada pela moderação",
  CANCELADA: "Cancelada",
};

/** Tom do selo de status; `null` é geração ainda sem desfecho registrado. */
export function tomDoStatusGeracao(
  status: StatusGeracao | null,
): "success" | "warning" | "danger" | "brand" {
  if (status === "CONCLUIDA") return "success";
  if (status === "BLOQUEADA") return "warning";
  if (status === "FALHOU" || status === "CANCELADA") return "danger";
  return "brand";
}

/** Uma geração como o painel a enxerga, qualquer que seja o provedor. */
export interface GeracaoImagem {
  /** Id da requisição no provedor — é por ele que o painel acompanha. */
  requestId: string;
  status: StatusGeracao;
  /** Imagens prontas: https do provedor, ou a prévia SVG do sandbox. */
  imagens: string[];
  /** Motivo legível quando não concluiu — nunca o corpo cru do provedor. */
  erro?: string;
}

export interface PresetMarketing {
  id: string;
  nome: string;
  tipo: string;
}

export interface PaginaPresets {
  itens: PresetMarketing[];
  /** `null` quando não há próxima página. */
  cursor: string | null;
}

/**
 * Só dois tipos de link viram `<img>` ou `<a>` no painel: https (o que o
 * provedor entrega) e a prévia SVG do sandbox. Qualquer outra coisa — um
 * `javascript:` num JSON de auditoria adulterado, por exemplo — não é exibida.
 * SVG dentro de `<img>` não executa script, por isso a prévia é segura.
 */
export function linkDeImagemExibivel(url: string): boolean {
  if (url.startsWith("data:image/svg+xml")) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Pontos de partida pensados para o AirFlow. Preenchem o formulário; o texto
 * continua editável antes de gerar.
 */
export const SUGESTOES_PROMPT: ReadonlyArray<{
  rotulo: string;
  proporcao: ProporcaoImagem;
  prompt: string;
}> = [
  {
    rotulo: "Foto do técnico (hero da home)",
    proporcao: "1:1",
    prompt:
      "Fotografia realista de um técnico brasileiro de climatização, uniforme azul-marinho " +
      "discreto, sorrindo, instalando um ar-condicionado split branco em uma sala clara e " +
      "moderna. Luz natural suave, fundo limpo e levemente desfocado em tons de lavanda " +
      "(#EFE8FF), enquadramento centralizado da cintura para cima, estética de campanha " +
      "publicitária premium, sem texto na imagem.",
  },
  {
    rotulo: "Post de verão",
    proporcao: "3:4",
    prompt:
      "Post de campanha para redes sociais: sala de estar aconchegante num dia de muito " +
      "calor, ar-condicionado split ligado com uma brisa fresca estilizada, família " +
      "relaxando no sofá. Paleta violeta (#6F42F5) e lavanda, luz de fim de tarde, espaço " +
      "vazio na parte de cima para um título, estética limpa e moderna, sem texto na imagem.",
  },
  {
    rotulo: "Recrutamento de técnicos",
    proporcao: "16:9",
    prompt:
      "Retrato profissional de uma técnica de refrigeração brasileira segurando um manifold " +
      "e ferramentas, confiante, em frente a uma van de serviço branca. Luz de fim de " +
      "tarde, fundo desfocado, toques de violeta na composição, espaço livre à esquerda " +
      "para texto, estilo anúncio de recrutamento, sem texto na imagem.",
  },
];
