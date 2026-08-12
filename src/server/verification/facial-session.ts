/**
 * Sessão da validação facial — cookie httpOnly assinado (jose HS256), 10 min.
 *
 * A sessão liga o id da sessão do provedor ao prestador que a abriu, para o
 * `validar` não aceitar uma sessão criada por outro. Mesmo padrão de
 * assinatura da sessão de auth (`AUTH_SECRET`), com TTL curto: uma validação
 * facial não deve ficar pendente por dias.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const FACIAL_COOKIE = "facial_session";
const MAX_AGE_SECONDS = 10 * 60;

export interface FacialSessionPayload {
  providerProfileId: string;
  sessaoId: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres). Configure o .env.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function emitirFacialSession(payload: FacialSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verificarFacialSession(
  token: string,
): Promise<FacialSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (
      typeof payload.providerProfileId !== "string" ||
      typeof payload.sessaoId !== "string"
    ) {
      return null;
    }
    return {
      providerProfileId: payload.providerProfileId,
      sessaoId: payload.sessaoId,
    };
  } catch {
    // Inválida, expirada ou adulterada — tratada como sessão ausente.
    return null;
  }
}

export async function setFacialSessionCookie(payload: FacialSessionPayload): Promise<void> {
  const token = await emitirFacialSession(payload);
  const store = await cookies();
  store.set(FACIAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearFacialSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(FACIAL_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
