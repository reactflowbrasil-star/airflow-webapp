import { NextResponse } from "next/server";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { redefinirSenhaSchema } from "@/lib/validation/auth";
import { clientKey, rateLimit } from "@/server/auth/rate-limit";
import { clearSessionCookie } from "@/server/auth/session";
import { redefinirSenha } from "@/server/services/password-reset-service";

/**
 * Passo 2 da recuperação de senha: código + nova senha.
 *
 * Não exige sessão. Ao trocar, a sessão do dispositivo atual (se existir) é
 * encerrada — e as demais morrem sozinhas no próximo `getSession` via
 * `passwordChangedAt`. O cookie é limpo aqui para o usuário relogar com a
 * senha nova já nesta aba.
 */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const limite = rateLimit(clientKey(request, "recuperar-senha:redefinir"), 10, 3600);
  if (!limite.allowed) {
    return apiError(429, "RATE_LIMITED", "Muitas tentativas. Tente mais tarde.");
  }

  const input = await parseJsonBody(request, redefinirSenhaSchema);

  await redefinirSenha({
    email: input.email,
    codigo: input.codigo,
    novaSenha: input.novaSenha,
    correlationId,
  });

  await clearSessionCookie();

  return NextResponse.json({ ok: true });
});
