import { NextResponse } from "next/server";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import {
  confirmarCodigoSchema,
  solicitarCodigoSchema,
} from "@/lib/validation/auth";
import { clientKey, rateLimit } from "@/server/auth/rate-limit";
import { requireSession } from "@/server/auth/rbac";
import { setSessionCookie } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  confirmarCodigo,
  solicitarCodigo,
} from "@/server/services/verification-service";

/**
 * Verificação de telefone por WhatsApp (§6).
 *
 * `requireSession` e não `requireVerifiedSession`: esta é justamente a rota
 * que o usuário pendente precisa alcançar para deixar de ser pendente.
 *
 * Limite por IP em cima do limite por telefone que já existe no serviço: um
 * atacante com muitos números seria barrado aqui, e um com muitos IPs seria
 * barrado lá.
 */

/** POST — pede um código. */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireSession();

  const limite = rateLimit(clientKey(request, "verificacao:enviar"), 5, 3600);
  if (!limite.allowed) {
    return apiError(429, "RATE_LIMITED", "Muitos pedidos. Tente mais tarde.");
  }

  const { telefone } = await parseJsonBody(request, solicitarCodigoSchema);

  const resultado = await solicitarCodigo({
    userId: session.userId,
    telefone,
    correlationId,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json(resultado, { status: 202 });
});

/** PUT — confirma o código e ativa a conta. */
export const PUT = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireSession();

  const limite = rateLimit(clientKey(request, "verificacao:conferir"), 20, 3600);
  if (!limite.allowed) {
    return apiError(429, "RATE_LIMITED", "Muitas tentativas. Tente mais tarde.");
  }

  const { codigo } = await parseJsonBody(request, confirmarCodigoSchema);

  await confirmarCodigo({ userId: session.userId, codigo, correlationId });

  // Reemite o cookie: o status vive no token, e sem isso o usuário
  // continuaria barrado pelos guards até a sessão expirar.
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { status: true },
  });
  await setSessionCookie({ ...session, status: usuario.status });

  return NextResponse.json({ verificado: true });
});
