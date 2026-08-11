import { NextResponse } from "next/server";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { registerSchema } from "@/lib/validation/auth";
import { clientKey, rateLimit } from "@/server/auth/rate-limit";
import { setSessionCookie } from "@/server/auth/session";
import { registerUser } from "@/server/services/auth-service";
import { solicitarCodigo } from "@/server/services/verification-service";

export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const limit = rateLimit(clientKey(request, "register"), 5, 600);
  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde alguns minutos.");
  }

  const input = await parseJsonBody(request, registerSchema);
  const session = await registerUser(input, correlationId);
  await setSessionCookie(session);

  // Dispara o código já no cadastro: obrigar um toque a mais só para pedir o
  // que a próxima tela já vai cobrar seria atrito sem propósito. Falha de
  // envio NÃO derruba o cadastro — a conta existe, e a tela de verificação
  // oferece reenviar.
  const verificacao = await solicitarCodigo({
    userId: session.userId,
    telefone: input.phone,
    correlationId,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
  }).catch(() => null);

  return NextResponse.json(
    {
      user: { id: session.userId, email: session.email, role: session.role },
      verificacao: verificacao
        ? { telefoneMascarado: verificacao.telefoneMascarado, entregue: verificacao.entregue }
        : { entregue: false },
    },
    { status: 201 },
  );
});
