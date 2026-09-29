/**
 * Exemplo mínimo do SDK oficial da Higgsfield (`@higgsfield/client`, v2).
 *
 * Submete uma geração com `subscribe`, espera o estado terminal e imprime a
 * URL da mídia. Por padrão gera o vídeo pedido no setup (Seedance 2.5
 * text-to-video); com o argumento `imagem`, gera uma imagem com o Marketing
 * Studio Image (GPT Image 2.5 Sunburst).
 *
 *     pnpm higgsfield:exemplo                   # vídeo, prompt padrão
 *     pnpm higgsfield:exemplo imagem            # imagem, prompt padrão
 *     pnpm higgsfield:exemplo imagem "outro prompt"
 *
 * CADA EXECUÇÃO É UMA GERAÇÃO COBRADA na conta dona da credencial.
 *
 * Credencial: `HF_CREDENTIALS` no formato `key-id:key-secret` (o nome que o SDK
 * lê), vinda do ambiente ou do `.env.local` — ignorado pelo Git. O valor nunca
 * é impresso, nem nos erros: ver `descreverErro`.
 */

import { config as carregarEnv } from "dotenv";
import {
  APIError,
  AuthenticationError,
  BadInputError,
  CredentialsMissedError,
  NotEnoughCreditsError,
  TimeoutError,
  ValidationError,
  config,
  higgsfield,
  type V2Response,
} from "@higgsfield/client/v2";

interface Exemplo {
  modelo: string;
  descricao: string;
  entrada: (prompt: string) => Record<string, unknown>;
  /** URLs de mídia de um resultado `completed`. */
  urls: (resultado: V2Response) => string[];
}

const PROMPT_PADRAO = "A cinematic scene at sunset";

const EXEMPLOS: Record<"video" | "imagem", Exemplo> = {
  // Parâmetros do pedido de setup. Os demais campos (áudio, bitrate) ficam no
  // default da API — o exemplo não inventa valor que ninguém pediu.
  video: {
    modelo: "bytedance/seedance-2.5/text-to-video",
    descricao: "vídeo (Seedance 2.5 text-to-video)",
    entrada: (prompt) => ({
      prompt,
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    }),
    urls: (resultado) => (resultado.video?.url ? [resultado.video.url] : []),
  },
  // "Required Parameters Example" da documentação do modelo.
  imagem: {
    modelo: "marketing-studio/image/sunburst",
    descricao: "imagem (Marketing Studio Image · GPT Image 2.5 Sunburst)",
    entrada: (prompt) => ({
      prompt,
      quality: "high",
      moderation: "auto",
      resolution: "2k",
      aspect_ratio: "auto",
      enhance_prompt: false,
    }),
    urls: (resultado) => (resultado.images ?? []).map((imagem) => imagem.url),
  },
};

/** Vídeo pode demorar minutos; o default do SDK (5 min) corta cedo demais. */
const ESPERA_MAXIMA_MS = 15 * 60_000;
const INTERVALO_POLLING_MS = 5_000;

/**
 * Traduz qualquer falha em texto seguro para o terminal.
 *
 * Nunca imprima o objeto de erro cru: o SDK relança o `AxiosError` de falhas
 * de rede, e ele carrega `config.headers.Authorization` — a credencial inteira.
 */
function descreverErro(erro: unknown): string {
  if (erro instanceof CredentialsMissedError) {
    return "credencial ausente — defina HF_CREDENTIALS (key-id:key-secret).";
  }
  if (erro instanceof AuthenticationError) {
    return "401 — a Higgsfield recusou a credencial. Confira ou gere outra em https://open.higgsfield.ai/api-keys.";
  }
  if (erro instanceof NotEnoughCreditsError) {
    // O SDK traduz TODO 403 para "sem créditos": também pode ser acesso negado
    // ao modelo ou um proxy de rede recusando o host.
    return "403 — créditos insuficientes ou acesso negado (conta, modelo ou proxy de rede bloqueando api.higgsfield.ai).";
  }
  if (erro instanceof ValidationError || erro instanceof BadInputError) {
    const detalhes = (erro.details ?? [])
      .map((d) => `${d.loc.join(".")}: ${d.msg}`)
      .join("; ");
    return `${erro.statusCode} — entrada recusada pela API: ${detalhes || erro.message}`;
  }
  if (erro instanceof TimeoutError) {
    return (
      `a geração não terminou em ${ESPERA_MAXIMA_MS / 60_000} min. Ela pode seguir na fila ou ter sido ` +
      "cancelada (o polling do SDK 0.2.6 não trata `canceled` como estado final). Confira o histórico " +
      "em https://open.higgsfield.ai antes de tentar de novo — reenviar cria outra geração cobrada."
    );
  }
  if (erro instanceof APIError) {
    if (erro.statusCode === 429) {
      return "429 — limite de requisições da Higgsfield. Espere um pouco antes de tentar de novo.";
    }
    return `HTTP ${erro.statusCode ?? "?"} — ${erro.message}`;
  }
  if (erro instanceof Error) {
    const codigo = (erro as { code?: unknown }).code;
    return `${typeof codigo === "string" ? `${codigo} — ` : ""}${erro.message}`;
  }
  return "falha desconhecida";
}

function credencialValida(valor: string | undefined): boolean {
  // O SDK divide no ":" e exige exatamente duas partes.
  const partes = (valor ?? "").trim().split(":");
  return partes.length === 2 && partes.every((parte) => parte.length > 0);
}

async function main(): Promise<number> {
  // Não sobrescreve o que já veio do ambiente (ex.: variável do Coolify/CI).
  carregarEnv({ path: ".env.local", quiet: true });

  const [modo = "video", ...resto] = process.argv.slice(2);
  if (modo !== "video" && modo !== "imagem") {
    console.error(`Modo desconhecido: "${modo}". Use "video" ou "imagem".`);
    return 2;
  }
  const exemplo = EXEMPLOS[modo];
  const prompt = resto.join(" ").trim() || PROMPT_PADRAO;

  if (!credencialValida(process.env.HF_CREDENTIALS)) {
    console.error(
      "HF_CREDENTIALS ausente ou fora do formato key-id:key-secret.\n" +
        "Coloque a linha HF_CREDENTIALS=<key-id>:<key-secret> no .env.local (ignorado pelo Git)\n" +
        "ou exporte a variável no ambiente. Nunca cole a chave em chat, commit ou log.",
    );
    return 2;
  }

  config({
    credentials: process.env.HF_CREDENTIALS!.trim(),
    baseURL: process.env.HF_API_BASE_URL || "https://api.higgsfield.ai",
    // O SDK reenvia o POST sozinho em ECONNRESET/ETIMEDOUT/5xx. Numa geração
    // cobrada isso é perigoso: o primeiro envio pode ter sido aceito antes da
    // conexão cair, e o reenvio vira uma segunda geração. Zero reenvios.
    maxRetries: 0,
    pollInterval: INTERVALO_POLLING_MS,
    maxPollTime: ESPERA_MAXIMA_MS,
  });

  console.log(`Gerando ${exemplo.descricao} — modelo ${exemplo.modelo}`);
  console.log(`Prompt: "${prompt}"`);
  console.log("Aguardando o resultado (a Higgsfield processa em fila)…");

  let resultado: V2Response;
  try {
    resultado = await higgsfield.subscribe(exemplo.modelo, {
      input: exemplo.entrada(prompt),
      withPolling: true,
    });
  } catch (erro) {
    console.error(`✗ Falhou antes do resultado: ${descreverErro(erro)}`);
    return 1;
  }

  // O tipo do SDK não lista `canceled`, mas a API devolve (doc do modelo).
  const status: string = resultado.status;
  const pedido = resultado.request_id ? ` (request_id ${resultado.request_id})` : "";

  switch (status) {
    case "completed": {
      const urls = exemplo.urls(resultado);
      if (urls.length === 0) {
        console.error(`✗ A API respondeu "completed" sem URL de mídia${pedido}.`);
        return 1;
      }
      console.log(`✓ Concluído${pedido}.`);
      for (const url of urls) console.log(url);
      return 0;
    }
    case "failed": {
      const motivo = (resultado as V2Response & { error?: unknown }).error;
      console.error(
        `✗ A geração falhou${pedido}: ${typeof motivo === "string" ? motivo.slice(0, 300) : "sem motivo informado"}. ` +
          "Segundo a documentação, os créditos são devolvidos.",
      );
      return 1;
    }
    case "nsfw":
      console.error(
        `✗ Bloqueada pela moderação de conteúdo${pedido}. Ajuste o prompt; os créditos são devolvidos.`,
      );
      return 1;
    case "canceled":
      console.error(`✗ A geração foi cancelada${pedido}.`);
      return 1;
    default:
      console.error(`✗ Estado inesperado "${status}"${pedido} — nada foi gerado com sucesso.`);
      return 1;
  }
}

main()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((erro: unknown) => {
    console.error(`✗ Erro inesperado: ${descreverErro(erro)}`);
    process.exitCode = 1;
  });
