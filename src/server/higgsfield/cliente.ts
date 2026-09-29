/**
 * Cliente REST da Higgsfield — adapter de servidor.
 *
 * Contrato (template oficial higgsfield-ai/app-templates + documentação dos
 * modelos): `POST /<modelo>` devolve `request_id`; `GET /requests/{id}/status`
 * até `completed | failed | nsfw | canceled`; `POST /requests/{id}/cancel`
 * (só enquanto `queued`); `POST /files/generate-upload-url` devolve a URL
 * assinada de upload. Autenticação: `Authorization: Key <chave como copiada>`.
 *
 * Por que REST direto e não o SDK oficial (instalado e usado no exemplo
 * `pnpm higgsfield:exemplo`): o SDK exige a chave no formato key-id:key-secret
 * e a tela aceita a chave como copiada; o cliente v2 não tem cancelamento nem
 * upload assinado; e ele reenvia o POST em ECONNRESET/5xx — numa geração
 * cobrada, o reenvio pode virar uma segunda geração.
 *
 * Nada aqui vai para log além de método, caminho, status e duração: nem a
 * chave, nem o corpo das respostas, nem a URL assinada de upload — que é uma
 * credencial de escrita no storage.
 */

import { logger } from "@/server/observability/logger";

export const HF_API_BASE_URL_PADRAO = "https://api.higgsfield.ai";

const TIMEOUT_ENVIO_MS = 30_000;
const TIMEOUT_PADRAO_MS = 15_000;
const CAMINHO_UPLOAD = "/files/generate-upload-url";
const CAMINHO_PRESETS = "/marketing-studio/image/presets";
const CAMINHO_MODELO = /^[a-z0-9][a-z0-9._/-]*$/i;

export type TipoErroHiggsfield =
  | "CHAVE_RECUSADA"
  | "SEM_CREDITOS_OU_ACESSO"
  | "ENTRADA_INVALIDA"
  | "NAO_ENCONTRADO"
  | "CONFLITO"
  | "LIMITE"
  | "INDISPONIVEL"
  | "SEM_CONEXAO"
  | "SEM_RESPOSTA"
  | "RESPOSTA_INVALIDA";

export class ErroHiggsfield extends Error {
  constructor(
    readonly tipo: TipoErroHiggsfield,
    message: string,
    readonly status: number | null = null,
    readonly retryAfterSegundos: number | null = null,
  ) {
    super(message);
    this.name = "ErroHiggsfield";
  }

  /**
   * O envio pode ter sido aceito mesmo assim? Timeout ou queda depois de
   * conectar, 5xx (um gateway pode ter repassado antes de cair) e 2xx fora do
   * contrato: a geração pode existir lá. Só esses viram INDETERMINADA.
   */
  get resultadoIncerto(): boolean {
    return (
      this.tipo === "SEM_RESPOSTA" ||
      this.tipo === "INDISPONIVEL" ||
      this.tipo === "RESPOSTA_INVALIDA"
    );
  }
}

export interface RespostaEnvio {
  requestId: string;
  status: string;
}

export interface StatusRemoto {
  requestId: string;
  status: string;
  /** Imagens ou o vídeo — só URLs https entram. */
  urls: string[];
  erro: string | null;
}

export interface TicketUpload {
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  publicUrl: string;
  contentType: string;
}

export interface PresetMarketing {
  id: string;
  nome: string;
  tipo: string | null;
}

export interface PaginaPresets {
  itens: PresetMarketing[];
  cursor: string | null;
}

export interface ClienteHiggsfield {
  enviar(modelo: string, entrada: Record<string, unknown>): Promise<RespostaEnvio>;
  consultar(requestId: string): Promise<StatusRemoto>;
  cancelar(requestId: string): Promise<void>;
  criarUpload(contentType: string): Promise<TicketUpload>;
  listarPresets(cursor?: string | null): Promise<PaginaPresets>;
}

export interface OpcoesCliente {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  correlationId?: string;
}

/** Base da API, só do servidor. Vazio ou ausente cai no endereço oficial. */
export function baseUrlHiggsfield(): string {
  return (process.env.HF_API_BASE_URL || HF_API_BASE_URL_PADRAO).replace(/\/+$/, "");
}

export function criarClienteHiggsfield(opcoes: OpcoesCliente): ClienteHiggsfield {
  const base = (opcoes.baseUrl ?? baseUrlHiggsfield()).replace(/\/+$/, "");
  const buscar = opcoes.fetch ?? fetch;
  const autorizacao = `Key ${opcoes.apiKey}`;

  async function chamar(
    metodo: "GET" | "POST",
    caminho: string,
    corpo: Record<string, unknown> | undefined,
    timeoutMs: number,
  ): Promise<unknown> {
    const inicio = Date.now();
    let resposta: Response;
    try {
      resposta = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: autorizacao,
          Accept: "application/json",
          ...(corpo ? { "Content-Type": "application/json" } : {}),
        },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (erro) {
      const classificado = erroDeRede(erro);
      logger.warn("Higgsfield inacessível", {
        correlationId: opcoes.correlationId,
        metodo,
        caminho: caminhoParaLog(caminho),
        tipo: classificado.tipo,
        ms: Date.now() - inicio,
      });
      throw classificado;
    }

    const dados = await lerCorpo(resposta);
    logger.info("Higgsfield respondeu", {
      correlationId: opcoes.correlationId,
      metodo,
      caminho: caminhoParaLog(caminho),
      status: resposta.status,
      ms: Date.now() - inicio,
    });
    if (!resposta.ok) throw erroDeStatus(resposta, dados);
    return dados;
  }

  return {
    async enviar(modelo, entrada) {
      if (!CAMINHO_MODELO.test(modelo) || modelo.includes("..")) {
        throw new ErroHiggsfield("ENTRADA_INVALIDA", "Modelo inválido.");
      }
      const dados = registro(await chamar("POST", `/${modelo}`, entrada, TIMEOUT_ENVIO_MS));
      const requestId = texto(dados.request_id);
      if (!requestId) {
        throw new ErroHiggsfield(
          "RESPOSTA_INVALIDA",
          "A Higgsfield aceitou o envio sem devolver request_id.",
        );
      }
      return { requestId, status: texto(dados.status) ?? "queued" };
    },

    async consultar(requestId) {
      const dados = registro(
        await chamar(
          "GET",
          `/requests/${encodeURIComponent(requestId)}/status`,
          undefined,
          TIMEOUT_PADRAO_MS,
        ),
      );
      const status = texto(dados.status);
      if (!status) {
        throw new ErroHiggsfield("RESPOSTA_INVALIDA", "Resposta de status sem o campo status.");
      }
      const imagens = Array.isArray(dados.images)
        ? dados.images.map((imagem) => texto(registro(imagem).url))
        : [];
      const video = texto(registro(dados.video).url);
      return {
        requestId: texto(dados.request_id) ?? requestId,
        status,
        urls: [...imagens, video].filter(ehUrlHttps),
        erro: texto(dados.error)?.slice(0, 500) ?? null,
      };
    },

    async cancelar(requestId) {
      // A plataforma responde 202 e o status passa a `canceled` — a
      // confirmação vem pelo status, não por esta resposta.
      await chamar(
        "POST",
        `/requests/${encodeURIComponent(requestId)}/cancel`,
        {},
        TIMEOUT_PADRAO_MS,
      );
    },

    async criarUpload(contentType) {
      const dados = await chamar(
        "POST",
        CAMINHO_UPLOAD,
        { content_type: contentType },
        TIMEOUT_PADRAO_MS,
      );
      return validarTicketUpload(dados, contentType);
    },

    async listarPresets(cursor) {
      const busca = new URLSearchParams({ size: "50" });
      if (cursor) busca.set("cursor", cursor);
      const dados = registro(
        await chamar("GET", `${CAMINHO_PRESETS}?${busca}`, undefined, TIMEOUT_PADRAO_MS),
      );
      const itens = Array.isArray(dados.items)
        ? dados.items.flatMap((item): PresetMarketing[] => {
            const campos = registro(item);
            const id = texto(campos.id);
            const nome = texto(campos.name);
            return id && nome ? [{ id, nome, tipo: texto(campos.type) }] : [];
          })
        : [];
      return { itens, cursor: texto(dados.cursor) };
    },
  };
}

/**
 * Valida a resposta do upload assinado antes de ela chegar ao navegador.
 *
 * O navegador vai fazer PUT nessa URL com esses headers: URL que não seja
 * https, com usuário/senha embutidos, ou header que carregue credencial
 * (Authorization, Cookie) é recusado — o upload ao storage nunca leva a chave.
 */
export function validarTicketUpload(valor: unknown, contentType: string): TicketUpload {
  const invalido = () =>
    new ErroHiggsfield("RESPOSTA_INVALIDA", "Resposta de upload inválida da Higgsfield.");
  const dados = registro(valor);
  const uploadUrl = texto(dados.upload_url);
  const publicUrl = texto(dados.public_url);
  if (!uploadUrl || !publicUrl || !ehUrlHttps(uploadUrl) || !ehUrlHttps(publicUrl)) {
    throw invalido();
  }
  // O template oficial confere o content_type devolvido; a documentação da
  // tarefa não o lista — se vier, tem de bater com o pedido.
  if (dados.content_type !== undefined && dados.content_type !== contentType) {
    throw invalido();
  }

  const brutos = dados.upload_headers;
  if (brutos === undefined || brutos === null) {
    return { uploadUrl, publicUrl, contentType, uploadHeaders: {} };
  }
  if (typeof brutos !== "object" || Array.isArray(brutos)) throw invalido();
  const uploadHeaders: Record<string, string> = {};
  for (const [nome, valorHeader] of Object.entries(brutos)) {
    if (typeof valorHeader !== "string" || /^(authorization|cookie)$/i.test(nome)) {
      throw invalido();
    }
    if (/^content-type$/i.test(nome) && valorHeader.toLowerCase() !== contentType) {
      throw invalido();
    }
    uploadHeaders[nome] = valorHeader;
  }
  return { uploadUrl, publicUrl, contentType, uploadHeaders };
}

export function ehUrlHttps(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function registro(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor ? valor : null;
}

async function lerCorpo(resposta: Response): Promise<unknown> {
  const bruto = await resposta.text().catch(() => "");
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as unknown;
  } catch {
    return bruto;
  }
}

/** `detail` da API (string ou lista de erros de validação), sem ecoar a entrada. */
function detalheDaApi(dados: unknown): string | null {
  const detalhe = registro(dados).detail;
  if (typeof detalhe === "string" && detalhe) return detalhe.slice(0, 300);
  if (Array.isArray(detalhe)) {
    const partes = detalhe.flatMap((item) => {
      const campos = registro(item);
      const msg = texto(campos.msg);
      if (!msg) return [];
      const local = Array.isArray(campos.loc)
        ? campos.loc.filter((parte) => parte !== "body").join(".")
        : "";
      return [local ? `${local}: ${msg}` : msg];
    });
    return partes.length ? partes.join("; ").slice(0, 300) : null;
  }
  return null;
}

function erroDeStatus(resposta: Response, dados: unknown): ErroHiggsfield {
  const status = resposta.status;
  const detalhe = detalheDaApi(dados);
  const com = (base: string) => (detalhe ? `${base} ${detalhe}` : base);

  if (status === 401) {
    return new ErroHiggsfield(
      "CHAVE_RECUSADA",
      "A Higgsfield recusou a chave de API. Use “Replace API key” com uma chave válida.",
      status,
    );
  }
  if (status === 402 || status === 403) {
    return new ErroHiggsfield(
      "SEM_CREDITOS_OU_ACESSO",
      com("Sem créditos ou sem acesso a este recurso na Higgsfield."),
      status,
    );
  }
  if (status === 400 || status === 422) {
    return new ErroHiggsfield("ENTRADA_INVALIDA", com("A Higgsfield recusou a entrada."), status);
  }
  if (status === 404) {
    return new ErroHiggsfield("NAO_ENCONTRADO", "A Higgsfield não encontrou o recurso.", status);
  }
  if (status === 409) {
    return new ErroHiggsfield("CONFLITO", com("A Higgsfield recusou a operação agora."), status);
  }
  if (status === 429) {
    const retry = Number.parseInt(resposta.headers.get("retry-after") ?? "", 10);
    return new ErroHiggsfield(
      "LIMITE",
      "Limite de requisições da Higgsfield atingido. Aguarde um pouco.",
      status,
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }
  if (status >= 500) {
    return new ErroHiggsfield(
      "INDISPONIVEL",
      `A Higgsfield respondeu com erro (${status}).`,
      status,
    );
  }
  return new ErroHiggsfield("RESPOSTA_INVALIDA", `Resposta inesperada da Higgsfield (${status}).`, status);
}

/**
 * Falha antes de haver resposta. Recusa de conexão e DNS acontecem antes de
 * qualquer byte sair — nada foi enviado. Timeout e queda de socket podem ter
 * acontecido depois do envio: o resultado é desconhecido.
 */
function erroDeRede(erro: unknown): ErroHiggsfield {
  const causa = registro(registro(erro).cause);
  const codigo = texto(causa.code) ?? texto(registro(erro).code) ?? "";
  if (/^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|CERT_|ERR_TLS|DEPTH_ZERO|SELF_SIGNED)/.test(codigo)) {
    return new ErroHiggsfield(
      "SEM_CONEXAO",
      "Não foi possível conectar à Higgsfield — nada foi enviado. Verifique a rede do servidor.",
    );
  }
  return new ErroHiggsfield(
    "SEM_RESPOSTA",
    "A Higgsfield não respondeu a tempo. O pedido pode ter sido recebido.",
  );
}

/** O id da requisição pode ir ao log; o resto do caminho é fixo. */
function caminhoParaLog(caminho: string): string {
  return caminho.split("?")[0];
}
