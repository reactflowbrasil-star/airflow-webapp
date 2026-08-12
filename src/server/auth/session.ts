import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { prisma } from "@/server/db/prisma";

export type UserRole = "CUSTOMER" | "PROVIDER" | "ADMIN";
export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "BLOCKED";

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  /** Epoch seconds do momento de emissão — usado para revogar sessões antigas. */
  iat?: number;
  /**
   * Status no momento em que a sessão foi emitida. Fica no token para os
   * guards não fazerem um SELECT por requisição; a confirmação do código
   * reemite o cookie, então a transição PENDING_VERIFICATION → ACTIVE é
   * refletida na hora.
   */
  status: UserStatus;
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
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
      // Tokens emitidos antes deste campo existir continuam válidos e são
      // lidos como ACTIVE — não faz sentido derrubar a sessão de quem já
      // estava logado por causa de um campo novo.
      status: (payload.status as UserStatus | undefined) ?? "ACTIVE",
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

/**
 * Uma sessão foi revogada pela troca de senha?
 *
 * Pura de propósito — o e2e testa a regra sem cookie: token emitido num
 * segundo anterior ao da troca está morto; token do mesmo segundo (ou
 * posterior) segue vivo — o `iat` do JWT é em segundos e a comparação é na
 * granularidade dele; sem iat ou sem troca, segue válido.
 */
export function sessaoRevogadaPorTrocaDeSenha(
  iat: number | undefined,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!iat || !passwordChangedAt) return false;
  // Comparação na granularidade do `iat` (segundos): um token emitido no
  // MESMO segundo da troca (mas depois dela) não pode ser revogado — senão
  // quem acabou de trocar a senha e loga na hora é deslogado em seguida.
  return iat < Math.floor(passwordChangedAt.getTime() / 1000);
}

/**
 * Lê a sessão atual. Retorna null quando não autenticado ou revogado.
 *
 * Revogação: toda troca de senha grava `passwordChangedAt`; um token emitido
 * antes disso é recusado — quem roubou a sessão antiga perde o acesso no
 * mesmo instante da troca. É o único SELECT que o caminho de sessão faz, e é
 * por PK: barato, e o preço de uma revogação real de JWT stateless.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  if (session.iat) {
    const usuario = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordChangedAt: true },
    });
    if (!usuario) return null;
    if (sessaoRevogadaPorTrocaDeSenha(session.iat, usuario.passwordChangedAt)) {
      return null;
    }
  }

  return session;
}
