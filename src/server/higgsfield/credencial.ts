/**
 * Chave de API da Higgsfield do admin — guardada só no servidor.
 *
 * A chave colada no "Connect API key" vira um cookie httpOnly CIFRADO (JWE
 * dir + A256GCM), nunca volta ao navegador, nunca vai para localStorage e
 * nunca é devolvida por rota nenhuma. Três decisões:
 *
 *   - cifrada, não só httpOnly: cookie aparece em log de proxy, dump de
 *     header e extensão de navegador; cifrado, ele não vale nada fora deste
 *     servidor;
 *   - chave de cifra própria, derivada do AUTH_SECRET por HKDF: o mesmo
 *     segredo nunca assina sessão e cifra credencial com a mesma chave;
 *   - amarrada ao usuário (`sub`): o cookie é do navegador, não da pessoa. Se
 *     outro admin entrar no mesmo navegador, não herda a chave de quem a
 *     conectou — para ele, não há chave.
 */

import { hkdfSync } from "node:crypto";

import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";

import { normalizarChaveApi } from "@/domain/estudio/chave";

export const COOKIE_CHAVE_HIGGSFIELD = "airflow_hf_key";
const VALIDADE_SEGUNDOS = 60 * 60 * 24 * 30;

function chaveDeCifra(): Uint8Array {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error("AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres).");
  }
  return new Uint8Array(hkdfSync("sha256", segredo, "airflow", "higgsfield-api-key:v1", 32));
}

export async function cifrarChave(apiKey: string, userId: string): Promise<string> {
  return new EncryptJWT({ k: normalizarChaveApi(apiKey) })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${VALIDADE_SEGUNDOS}s`)
    .encrypt(chaveDeCifra());
}

/** Nulo para cookie ausente, adulterado, expirado ou de outro usuário. */
export async function decifrarChave(
  token: string | undefined,
  userId: string,
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, chaveDeCifra(), {
      subject: userId,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    return normalizarChaveApi(payload.k);
  } catch {
    return null;
  }
}

export async function lerChaveHiggsfield(userId: string): Promise<string | null> {
  const store = await cookies();
  return decifrarChave(store.get(COOKIE_CHAVE_HIGGSFIELD)?.value, userId);
}

export async function salvarChaveHiggsfield(apiKey: string, userId: string): Promise<void> {
  const token = await cifrarChave(apiKey, userId);
  const store = await cookies();
  store.set(COOKIE_CHAVE_HIGGSFIELD, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VALIDADE_SEGUNDOS,
  });
}

export async function removerChaveHiggsfield(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_CHAVE_HIGGSFIELD);
}
