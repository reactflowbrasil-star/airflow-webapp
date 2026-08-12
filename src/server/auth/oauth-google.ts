/**
 * OAuth 2.0 do Google (Authorization Code + PKCE) — §6.
 *
 * Por que à mão e não com uma lib de auth: o projeto já tem sessão própria
 * (JWT jose no cookie `airflow_session`), RBAC e fluxo de verificação de
 * telefone. Introduzir um framework de auth criaria uma segunda camada de
 * sessão convivendo com a primeira — duas fontes de verdade sobre "quem é o
 * usuário" é exatamente a ambiguidade que o §5 proíbe. O que o OAuth do
 * Google exige é pequeno e cabe nos padrões que já existem aqui.
 *
 * Este módulo concentra os helpers puros (PKCE, state, URL de autorização e
 * validação de claims) — testáveis sem rede nem banco. A troca de código e a
 * verificação criptográfica do id_token ficam no route handler do callback,
 * usando `fetch` e `jose` (que já é dependência do projeto).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Cookie httpOnly que guarda state/nonce/verifier durante o fluxo. */
export const OAUTH_COOKIE = "airflow_oauth";
export const OAUTH_TTL_SECONDS = 600; // 10 min — tempo para completar o fluxo

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Sem as credenciais, o botão nem aparece; com elas, o fluxo roda. */
export function googleOauthConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

/**
 * PKCE S256 (RFC 7636): o `verifier` é guardado no cookie e enviado na troca
 * do código; o `challenge` vai na URL de autorização. Um código capturado no
 * caminho é inútil sem o verifier — proteção contra interceptação.
 */
export function gerarPkce(): Pkce {
  const verifier = randomBytes(48).toString("base64url"); // 64 caracteres
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** State (CSRF) e nonce (anti-replay do id_token) usam o mesmo gerador. */
export function gerarTokenOauth(): string {
  return randomBytes(24).toString("base64url");
}

export interface UrlAutorizacaoParams {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

/** Monta a URL de autorização do Google. Função pura — testável. */
export function montarUrlAutorizacaoGoogle(params: UrlAutorizacaoParams): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export interface ClaimsIdToken {
  iss?: unknown;
  aud?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

export interface InformacoesGoogle {
  email: string;
  name: string;
}

/**
 * Validação de NEGÓCIO das claims do id_token — o `jwtVerify` já conferiu
 * assinatura, expiração e audiência; aqui mora o que é específico do produto:
 * emissor, nonce anti-replay e e-mail verificado pelo Google.
 */
export function validarClaimsIdToken(
  claims: ClaimsIdToken,
  { clientId, nonce }: { clientId: string; nonce: string },
): InformacoesGoogle | null {
  const iss = claims.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    return null;
  }
  const aud = claims.aud;
  const audValida = Array.isArray(aud) ? aud.includes(clientId) : aud === clientId;
  if (!audValida) return null;
  if (claims.nonce !== nonce) return null;
  // `email_verified` é a garantia de que o Google confirmou a posse do e-mail.
  if (claims.email_verified !== true) return null;
  if (typeof claims.email !== "string" || claims.email.trim().length === 0) {
    return null;
  }

  const email = claims.email.trim().toLowerCase();
  const name =
    typeof claims.name === "string" && claims.name.trim().length > 0
      ? claims.name.trim().slice(0, 120)
      : nomeDoEmail(email);
  return { email, name };
}

/** Nome de exibição derivado do e-mail quando o Google não envia `name`. */
export function nomeDoEmail(email: string): string {
  const parte = email.split("@")[0] ?? "usuario";
  const nome = parte
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return nome.length >= 2 ? nome.slice(0, 120) : "Usuário Google";
}

/** Comparação em tempo constante para o `state` do OAuth (CSRF). */
export function compararSegura(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
