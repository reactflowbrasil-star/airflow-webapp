import { NextResponse } from "next/server";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { recuperarSenhaSchema } from "@/lib/validation/auth";
import { clientKey, rateLimit } from "@/server/auth/rate-limit";
import { solicitarRecuperacaoSenha } from "@/server/services/password-reset-service";

/**
 * Passo 1 da recuperação de senha: pede o código para o WhatsApp da conta.
 *
 * Não exige sessão — quem esqueceu a senha está fora dela. Resposta sempre
 * 202 com a mesma forma, conta exista ou não (anti-oráculo no serviço).
 */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const limite = rateLimit(clientKey(request, "recuperar-senha:solicitar"), 5, 3600);
  if (!limite.allowed) {
    return apiError(429, "RATE_LIMITED", "Muitos pedidos. Tente mais tarde.");
  }

  const input = await parseJsonBody(request, recuperarSenhaSchema);

  await solicitarRecuperacaoSenha({
    email: input.email,
    correlationId,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json({ ok: true }, { status: 202 });
});
