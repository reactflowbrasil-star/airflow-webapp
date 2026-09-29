/**
 * Borda HTTP das rotas do Estúdio (/api/admin/estudio/*).
 */

import { NextResponse } from "next/server";

import { DomainError } from "@/domain/shared/errors";
import { apiError } from "@/lib/api";
import { ForbiddenError } from "@/server/auth/rbac";

import { criarClienteHiggsfield, ErroHiggsfield, type ClienteHiggsfield } from "./cliente";
import { lerChaveHiggsfield } from "./credencial";

/**
 * Recusa POST/DELETE vindos de outra origem.
 *
 * O cookie de sessão já é SameSite=Lax; esta é a segunda camada para as rotas
 * que gravam credencial e disparam geração cobrada. Compara com o host que o
 * proxy repassa (x-forwarded-host/host), não com `request.url` — atrás do
 * proxy de produção a URL interna não é a pública.
 */
export function exigirMesmaOrigem(request: Request): void {
  const origem = request.headers.get("origin");
  if (!origem) return;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim();
  let hostDaOrigem: string | null = null;
  try {
    hostDaOrigem = new URL(origem).host;
  } catch {
    // "null" e lixo caem na recusa abaixo.
  }
  if (!host || hostDaOrigem !== host) {
    throw new ForbiddenError("Requisição de outra origem recusada");
  }
}

/** Cliente com a chave do admin da sessão, ou erro que a tela entende. */
export async function clienteDoAdmin(
  userId: string,
  correlationId: string,
): Promise<ClienteHiggsfield> {
  const apiKey = await lerChaveHiggsfield(userId);
  if (!apiKey) {
    throw new DomainError(
      "HIGGSFIELD_CHAVE_AUSENTE",
      "Conecte a chave de API da Higgsfield para continuar (Connect API key).",
    );
  }
  return criarClienteHiggsfield({ apiKey, correlationId });
}

/**
 * Erro da Higgsfield em resposta estável. O `code` diz à tela o que fazer:
 * chave recusada abre o "Replace API key"; limite respeita o Retry-After.
 */
export function respostaErroHiggsfield(erro: ErroHiggsfield): NextResponse {
  switch (erro.tipo) {
    case "LIMITE": {
      const resposta = apiError(429, "HIGGSFIELD_LIMITE", erro.message);
      if (erro.retryAfterSegundos) {
        resposta.headers.set("Retry-After", String(erro.retryAfterSegundos));
      }
      return resposta;
    }
    case "CHAVE_RECUSADA":
    case "SEM_CREDITOS_OU_ACESSO":
    case "ENTRADA_INVALIDA":
    case "NAO_ENCONTRADO":
      return apiError(422, `HIGGSFIELD_${erro.tipo}`, erro.message);
    case "CONFLITO":
      return apiError(409, "HIGGSFIELD_CONFLITO", erro.message);
    default:
      return apiError(502, "HIGGSFIELD_INDISPONIVEL", erro.message);
  }
}

/** Executa e traduz ErroHiggsfield; o resto segue para o `withApiHandler`. */
export async function comErroHiggsfield(
  executar: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await executar();
  } catch (erro) {
    if (erro instanceof ErroHiggsfield) return respostaErroHiggsfield(erro);
    throw erro;
  }
}

/** Respostas do Estúdio nunca vão para cache: carregam estado e URL assinada. */
export function semCache(resposta: NextResponse): NextResponse {
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}
