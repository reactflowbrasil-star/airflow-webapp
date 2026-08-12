import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import {
  OAUTH_COOKIE,
  OAUTH_TTL_SECONDS,
  gerarPkce,
  gerarTokenOauth,
  googleOauthConfigurado,
  montarUrlAutorizacaoGoogle,
} from "@/server/auth/oauth-google";

/**
 * Início do fluxo OAuth do Google (GET) — §6.
 *
 * O botão "Entrar com Google" aponta para cá. Esta rota gera o `state`
 * (CSRF), o `nonce` (anti-replay do id_token) e o PKCE, guarda tudo num
 * cookie httpOnly de curta duração e redireciona o navegador para o Google.
 * Nada sensível vai na URL.
 */
export async function GET(request: Request) {
  if (!googleOauthConfigurado()) {
    return apiError(
      503,
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Login com Google não configurado. Informe GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.",
    );
  }

  const url = new URL(request.url);
  const redirecionar = url.searchParams.get("redirecionar");

  // Mesma regra da tela de login: só caminho interno, senão open redirect.
  const destino =
    redirecionar?.startsWith("/") && !redirecionar.startsWith("//")
      ? redirecionar
      : undefined;

  const { verifier, challenge } = gerarPkce();
  const state = gerarTokenOauth();
  const nonce = gerarTokenOauth();

  const autorizacaoUrl = montarUrlAutorizacaoGoogle({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    redirectUri: new URL("/api/auth/google/callback", request.url).toString(),
    state,
    nonce,
    codeChallenge: challenge,
  });

  const resposta = NextResponse.redirect(autorizacaoUrl);
  resposta.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ state, nonce, verifier, destino }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_TTL_SECONDS,
    },
  );
  return resposta;
}
