import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type UserRole = "CUSTOMER" | "PROVIDER" | "ADMIN";

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  /** Preenchido conforme o papel — evita um SELECT extra nos guards. */
  customerProfileId?: string;
  providerProfileId?: string;
}

const COOKIE_NAME = "airflow_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres). Configure o .env.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role as UserRole,
      customerProfileId: payload.customerProfileId as string | undefined,
      providerProfileId: payload.providerProfileId as string | undefined,
    };
  } catch {
    // Token inválido, expirado ou adulterado — tratado como ausência de sessão.
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Lê a sessão atual. Retorna null quando não autenticado. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
