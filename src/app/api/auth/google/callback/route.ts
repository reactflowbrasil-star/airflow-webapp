import { createRemoteJWKSet, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { clientKey, rateLimit } from "@/server/auth/rate-limit";
import {
  GOOGLE_JWKS_URL,
  GOOGLE_TOKEN_URL,
  OAUTH_COOKIE,
  compararSegura,
  googleOauthConfigurado,
  type ClaimsIdToken,
  validarClaimsIdToken,
} from "@/server/auth/oauth-google";
import { setSessionCookie } from "@/server/auth/session";
import { authenticateWithGoogle } from "@/server/services/auth-service";
import { logger } from "@/server/observability/logger";

// O JWKS é buscado do Google sob demanda e cacheado em memória pelo jose.
const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

interface PayloadOauth {
  state?: string;
  nonce?: string;
  verifier?: string;
  destino?: string | null;
}

function erroRedirect(request: Request, codigo: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/entrar?erro=${codigo}`, request.url),
  );
}

export const GET = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const limit = rateLimit(clientKey(request, "google-callback"), 10, 300);
  if (!limit.allowed) {
    return erroRedirect(request, "google-rate");
  }
  if (!googleOauthConfigurado()) {
    return erroRedirect(request, "google-falhou");
  }

  const url = new URL(request.url);
  const codigo = url.searchParams.get("code");
  const estadoRecebido = url.searchParams.get("state");
  const erroGoogle = url.searchParams.get("error");

  // O cookie com state/nonce/verifier é apagado em qualquer desfecho — um
  // fluxo concluído não pode ser reutilizado para replay.
  const store = await cookies();
  const oauthCookie = store.get(OAUTH_COOKIE)?.value;
  let oauth: PayloadOauth | null = null;
  try {
    oauth = oauthCookie ? (JSON.parse(oauthCookie) as PayloadOauth) : null;
  } catch {
    oauth = null;
  }

  // State inválido ou ausente = CSRF ou fluxo antigo. Não confia no resto.
  if (
    !oauth ||
    typeof oauth.state !== "string" ||
    !estadoRecebido ||
    !compararSegura(oauth.state, estadoRecebido)
  ) {
    logger.warn("Callback OAuth com state inválido", { correlationId });
    return erroRedirect(request, "google-invalido");
  }

  // Usuário desistiu na tela do Google: não é erro de sistema.
  if (erroGoogle) {
    logger.info("Usuário cancelou o login com Google", { correlationId });
    return erroRedirect(request, "google-negado");
  }
  if (!codigo) {
    return erroRedirect(request, "google-invalido");
  }

  // Troca do código de autorização por tokens.
  const troca = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: codigo,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: new URL("/api/auth/google/callback", request.url).toString(),
      grant_type: "authorization_code",
      code_verifier: oauth.verifier ?? "",
    }),
  });
  if (!troca.ok) {
    logger.error("Troca de código OAuth falhou", {
      correlationId,
      status: troca.status,
    });
    return erroRedirect(request, "google-falhou");
  }
  const tokens = (await troca.json()) as { id_token?: string };
  if (typeof tokens.id_token !== "string") {
    return erroRedirect(request, "google-falhou");
  }

  // Verificação criptográfica do id_token: assinatura via JWKS do Google,
  // emissor e audiência. Depois, a validação de negócio (nonce, e-mail).
  let claims: ClaimsIdToken;
  try {
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    claims = payload as ClaimsIdToken;
  } catch (error) {
    logger.error("id_token do Google inválido", {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return erroRedirect(request, "google-falhou");
  }

  const info = validarClaimsIdToken(claims, {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    nonce: oauth.nonce ?? "",
  });
  if (!info) {
    logger.warn("Claims do id_token rejeitadas", { correlationId });
    return erroRedirect(request, "google-falhou");
  }

  // Cria ou vincula a conta e emite a sessão padrão do projeto (jose).
  let session;
  try {
    session = await authenticateWithGoogle(info, correlationId);
  } catch (error) {
    logger.warn("Login Google recusado pelo domínio", {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return erroRedirect(request, "google-indisponivel");
  }
  await setSessionCookie(session);

  const destino =
    oauth.destino &&
    oauth.destino.startsWith("/") &&
    !oauth.destino.startsWith("//")
      ? oauth.destino
      : session.role === "PROVIDER"
        ? "/pro"
        : session.role === "ADMIN"
          ? "/admin"
          : "/app";

  const resposta = NextResponse.redirect(new URL(destino, request.url));
  resposta.cookies.delete(OAUTH_COOKIE);
  return resposta;
});
