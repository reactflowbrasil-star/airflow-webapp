/**
 * Marketing Studio Image — Higgsfield, modelo `marketing-studio/image/sunburst`
 * (GPT Image 2.5 Sunburst): gera e edita imagens de campanha.
 *
 * Contrato conferido no SDK oficial `@higgsfield/client` 0.2.6 (`dist/v2`,
 * baixado do registro npm), não presumido: a documentação em
 * docs.higgsfield.ai não é alcançável deste ambiente. O SDK não entrou como
 * dependência — puxaria axios e form-data para três chamadas HTTP, e o
 * repositório fala com fornecedor via `fetch` (Evolution, Google).
 *
 *     POST {base}/marketing-studio/image/sunburst       corpo = input do modelo
 *     GET  {base}/requests/{request_id}/status          polling do resultado
 *     GET  {base}/marketing-studio/image/presets?size=50&cursor=…
 *     Authorization: Key KEY_ID:KEY_SECRET
 *
 * Erros, como o próprio SDK os lê: 401 credencial recusada, 403 sem créditos,
 * 400/422 entrada recusada (`detail`), 5xx indisponível.
 */

import type { GeracaoImagem, PaginaPresets, StatusGeracao } from "@/lib/marketing-image";
import type { PedidoImagemMarketing } from "@/lib/validation/marketing";
import { logger } from "@/server/observability/logger";

import { ImagemMarketingError, type ImagemMarketingProvider } from "./image-provider";

const BASE_URL = "https://api.higgsfield.ai";
export const MODELO_MARKETING_STUDIO = "marketing-studio/image/sunburst";
const CAMINHO_PRESETS = "/marketing-studio/image/presets";
const TIMEOUT_MS = 30_000;
const TAMANHO_PAGINA_PRESETS = 50;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Texto vindo do provedor que chega ao painel é cortado — é dado, não relatório. */
const LIMITE_TEXTO_PROVEDOR = 300;

export type CredencialHiggsfield =
  | { estado: "ausente" }
  | { estado: "invalida" }
  | { estado: "ok"; autorizacao: string };

/**
 * Lê a credencial no formato do SDK: `KEY_ID:KEY_SECRET` em `HF_CREDENTIALS`
 * ou `HF_KEY`, nessa ordem. Devolve o estado e o header já montado — nunca o
 * valor para log.
 */
export function lerCredencialHiggsfield(
  env: Record<string, string | undefined> = process.env,
): CredencialHiggsfield {
  const bruto = [env.HF_CREDENTIALS, env.HF_KEY].map((v) => v?.trim()).find(Boolean);
  if (!bruto) return { estado: "ausente" };

  const partes = bruto.split(":");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { estado: "invalida" };
  return { estado: "ok", autorizacao: `Key ${partes[0]}:${partes[1]}` };
}

/**
 * Traduz o pedido para o corpo do modelo. Só campos do schema: o provedor
 * recusa propriedade desconhecida (`additionalProperties: false`).
 */
export function montarCorpoHiggsfield(pedido: PedidoImagemMarketing): Record<string, unknown> {
  return {
    prompt: pedido.prompt,
    quality: pedido.qualidade,
    resolution: pedido.resolucao,
    aspect_ratio: pedido.proporcao,
    // `low` existe no contrato, mas o estúdio produz peça de marca: relaxar a
    // moderação não é escolha que o painel precise oferecer.
    moderation: "auto",
    enhance_prompt: pedido.aprimorar,
    // A documentação manda omitir `image_urls` na geração do zero.
    ...(pedido.imagens.length > 0 ? { image_urls: pedido.imagens } : {}),
    ...(pedido.aprimorar && pedido.presetId ? { preset_id: pedido.presetId } : {}),
  };
}

const STATUS_DO_PROVEDOR: Record<string, StatusGeracao> = {
  queued: "NA_FILA",
  in_progress: "GERANDO",
  completed: "CONCLUIDA",
  failed: "FALHOU",
  nsfw: "BLOQUEADA",
  canceled: "CANCELADA",
};

/** `null` para status que o provedor ainda não tinha quando este adapter foi escrito. */
export function traduzirStatusHiggsfield(status: unknown): StatusGeracao | null {
  return typeof status === "string" ? (STATUS_DO_PROVEDOR[status] ?? null) : null;
}

function soHttps(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const MENSAGEM_POR_STATUS: Partial<Record<StatusGeracao, string>> = {
  BLOQUEADA: "A moderação do provedor bloqueou esta imagem. Reescreva o prompt e tente de novo.",
  CANCELADA: "A geração foi cancelada no Higgsfield.",
};

/**
 * Resposta do POST ou do polling → `GeracaoImagem`. `null` quando falta o
 * `request_id`: sem ele não há o que acompanhar, e seguir adiante esconderia
 * uma mudança de contrato.
 */
export function traduzirRespostaHiggsfield(dados: unknown): GeracaoImagem | null {
  if (!dados || typeof dados !== "object") return null;
  const resposta = dados as {
    request_id?: unknown;
    status?: unknown;
    images?: unknown;
    error?: unknown;
  };
  if (typeof resposta.request_id !== "string" || !GUID.test(resposta.request_id)) return null;

  // Status desconhecido conta como "ainda gerando": o polling segue até o
  // prazo, em vez de declarar terminado algo que talvez não esteja.
  const status = traduzirStatusHiggsfield(resposta.status) ?? "GERANDO";

  // Só https vira link no painel — nada de `javascript:` ou `data:` vindo de fora.
  const imagens = Array.isArray(resposta.images)
    ? resposta.images
        .map((imagem) => (imagem as { url?: unknown } | null)?.url)
        .filter(soHttps)
    : [];

  let erro = MENSAGEM_POR_STATUS[status];
  if (status === "FALHOU") {
    erro =
      typeof resposta.error === "string" && resposta.error.trim()
        ? `O Higgsfield não concluiu a geração: ${resposta.error.trim().slice(0, LIMITE_TEXTO_PROVEDOR)}`
        : "O Higgsfield não concluiu a geração.";
  } else if (status === "CONCLUIDA" && imagens.length === 0) {
    // Sem isto a tela diria "Pronta" sem nada para mostrar nem explicar.
    erro = "O Higgsfield concluiu a geração sem devolver imagem utilizável.";
  }

  return { requestId: resposta.request_id, status, imagens, ...(erro ? { erro } : {}) };
}

/** Catálogo de presets → `PaginaPresets`. Só os campos documentados (`id`, `type`, `name`). */
export function traduzirPresetsHiggsfield(dados: unknown): PaginaPresets | null {
  if (!dados || typeof dados !== "object") return null;
  const resposta = dados as { items?: unknown; cursor?: unknown };
  if (!Array.isArray(resposta.items)) return null;

  const itens = resposta.items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { id, name, type } = item as { id?: unknown; name?: unknown; type?: unknown };
    // Id fora do formato não passaria na validação do pedido: nem mostrar.
    if (typeof id !== "string" || !GUID.test(id) || typeof name !== "string") return [];
    return [{ id, nome: name.slice(0, 120), tipo: typeof type === "string" ? type : "ads" }];
  });

  const cursor =
    typeof resposta.cursor === "string" && resposta.cursor ? resposta.cursor : null;
  return { itens, cursor };
}

/** `detail` como o SDK o lê: texto ou lista `{ loc, msg }` no formato FastAPI. */
export function descreverDetalheHiggsfield(corpo: unknown): string | null {
  const detail = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim().slice(0, LIMITE_TEXTO_PROVEDOR);
  }
  if (!Array.isArray(detail)) return null;

  const partes = detail.flatMap((erro) => {
    const { loc, msg } = (erro ?? {}) as { loc?: unknown; msg?: unknown };
    if (typeof msg !== "string") return [];
    const campo = Array.isArray(loc)
      ? loc.filter((p) => typeof p === "string" || typeof p === "number").join(".")
      : "";
    return [campo ? `${campo}: ${msg}` : msg];
  });
  return partes.length > 0 ? partes.join("; ").slice(0, LIMITE_TEXTO_PROVEDOR) : null;
}

type Operacao = "gerar" | "consultar" | "presets";

export class HiggsfieldImagemProvider implements ImagemMarketingProvider {
  readonly id = "higgsfield";
  readonly modo = "real" as const;
  readonly modelo = MODELO_MARKETING_STUDIO;

  constructor(
    private readonly autorizacao: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Sem retentativa automática, ao contrário do SDK: o POST é cobrado, e
   * repetir um pedido cuja resposta se perdeu no caminho pode cobrar duas
   * vezes. Quem decide repetir é o operador, vendo o histórico.
   */
  async gerar(pedido: PedidoImagemMarketing, correlationId: string): Promise<GeracaoImagem> {
    const dados = await this.requisitar(
      "gerar",
      "POST",
      `/${MODELO_MARKETING_STUDIO}`,
      correlationId,
      montarCorpoHiggsfield(pedido),
    );
    const geracao = this.exigirGeracao(dados, "gerar", correlationId);
    logger.info("Imagem de marketing enfileirada no Higgsfield", {
      correlationId,
      requestId: geracao.requestId,
      status: geracao.status,
    });
    return geracao;
  }

  async consultar(requestId: string, correlationId: string): Promise<GeracaoImagem> {
    // O id vai para o path: fora do formato, nem sai daqui.
    if (!GUID.test(requestId)) {
      throw new ImagemMarketingError(
        "MARKETING_GERACAO_NAO_ENCONTRADA",
        "Geração não encontrada.",
      );
    }
    const dados = await this.requisitar(
      "consultar",
      "GET",
      `/requests/${requestId}/status`,
      correlationId,
    );
    const geracao = this.exigirGeracao(dados, "consultar", correlationId);
    if (traduzirStatusHiggsfield((dados as { status?: unknown }).status) === null) {
      logger.warn("Status desconhecido do Higgsfield — tratado como em andamento", {
        correlationId,
        requestId,
      });
    }
    return geracao;
  }

  async listarPresets(cursor: string | undefined, correlationId: string): Promise<PaginaPresets> {
    const query = new URLSearchParams({ size: String(TAMANHO_PAGINA_PRESETS) });
    if (cursor) query.set("cursor", cursor);
    const dados = await this.requisitar(
      "presets",
      "GET",
      `${CAMINHO_PRESETS}?${query}`,
      correlationId,
    );
    const pagina = traduzirPresetsHiggsfield(dados);
    if (!pagina) throw this.respostaInesperada("presets", correlationId);
    return pagina;
  }

  private exigirGeracao(dados: unknown, operacao: Operacao, correlationId: string): GeracaoImagem {
    const geracao = traduzirRespostaHiggsfield(dados);
    if (!geracao) throw this.respostaInesperada(operacao, correlationId);
    return geracao;
  }

  private respostaInesperada(operacao: Operacao, correlationId: string): ImagemMarketingError {
    logger.error("Resposta do Higgsfield fora do contrato", { correlationId, operacao });
    return new ImagemMarketingError(
      "MARKETING_PROVEDOR_INDISPONIVEL",
      "O Higgsfield respondeu num formato inesperado. Tente de novo em instantes.",
    );
  }

  private async requisitar(
    operacao: Operacao,
    metodo: "GET" | "POST",
    caminho: string,
    correlationId: string,
    corpo?: Record<string, unknown>,
  ): Promise<unknown> {
    let resposta: Response;
    try {
      resposta = await this.fetchImpl(`${BASE_URL}${caminho}`, {
        method: metodo,
        headers: {
          authorization: this.autorizacao,
          accept: "application/json",
          ...(corpo ? { "content-type": "application/json" } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // Só o nome do erro (TimeoutError, TypeError…): a mensagem de alguns
      // runtimes inclui a URL, e não há por que arriscar.
      logger.error("Falha de rede ao falar com o Higgsfield", {
        correlationId,
        operacao,
        erro: error instanceof Error ? error.name : "desconhecido",
      });
      throw new ImagemMarketingError(
        "MARKETING_PROVEDOR_INDISPONIVEL",
        "Não foi possível falar com o Higgsfield. Tente de novo em instantes.",
      );
    }

    if (!resposta.ok) {
      // O corpo do erro não vai para o log: pode ecoar o pedido, e o pedido
      // pode ter link assinado de imagem de referência.
      logger.warn("Higgsfield recusou a requisição", {
        correlationId,
        operacao,
        status: resposta.status,
      });
      throw await erroDaResposta(resposta);
    }

    try {
      return await resposta.json();
    } catch {
      throw this.respostaInesperada(operacao, correlationId);
    }
  }
}

async function erroDaResposta(resposta: Response): Promise<ImagemMarketingError> {
  switch (resposta.status) {
    case 401:
      return new ImagemMarketingError(
        "MARKETING_CREDENCIAIS_RECUSADAS",
        "O Higgsfield recusou a credencial. Confira HF_KEY no servidor (formato KEY_ID:KEY_SECRET).",
      );
    case 403:
      return new ImagemMarketingError(
        "MARKETING_SEM_CREDITOS",
        "A conta Higgsfield recusou a geração: sem créditos suficientes ou sem acesso a este modelo.",
      );
    case 404:
      return new ImagemMarketingError(
        "MARKETING_GERACAO_NAO_ENCONTRADA",
        "O Higgsfield não encontrou esta geração.",
      );
    case 429:
      return new ImagemMarketingError(
        "MARKETING_LIMITE_PROVEDOR",
        "O Higgsfield limitou as requisições. Aguarde um pouco e tente de novo.",
      );
    case 400:
    case 422: {
      const detalhe = descreverDetalheHiggsfield(await resposta.json().catch(() => null));
      return new ImagemMarketingError(
        "MARKETING_PEDIDO_RECUSADO",
        detalhe
          ? `O Higgsfield recusou o pedido: ${detalhe}`
          : "O Higgsfield recusou o pedido. Revise os campos e tente de novo.",
      );
    }
    default:
      return new ImagemMarketingError(
        "MARKETING_PROVEDOR_INDISPONIVEL",
        "O Higgsfield está indisponível no momento. Tente de novo em instantes.",
      );
  }
}
