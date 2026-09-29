import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { clearSessionCookie } from "@/server/auth/session";
import { removerChaveHiggsfield } from "@/server/higgsfield/credencial";

export const POST = withApiHandler(async () => {
  await clearSessionCookie();
  // A chave da Higgsfield do Estúdio sai junto: num computador compartilhado,
  // sair da conta não pode deixar uma credencial cobrável para trás.
  await removerChaveHiggsfield();
  return NextResponse.json({ ok: true });
});
