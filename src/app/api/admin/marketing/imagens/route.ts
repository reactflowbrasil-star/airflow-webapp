import { NextResponse } from "next/server";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { pedidoImagemMarketingSchema } from "@/lib/validation/marketing";
import { rateLimit } from "@/server/auth/rate-limit";
import { requireAdmin } from "@/server/auth/rbac";
import { solicitarImagemMarketing } from "@/server/services/marketing-image-service";

/**
 * Pede uma imagem ao estúdio de marketing (admin). Responde 202 com o id para
 * acompanhar: a geração leva de segundos a minutos no provedor.
 *
 * O limite é por operador, não por IP, e só conta pedido válido — protege a
 * conta de clique repetido e de script em loop, sem impedir o admin de gerar.
 */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireAdmin();
  const pedido = await parseJsonBody(request, pedidoImagemMarketingSchema);

  const limite = rateLimit(`estudio-marketing:${session.userId}`, 20, 600);
  if (!limite.allowed) {
    return apiError(
      429,
      "RATE_LIMITED",
      `Muitas gerações seguidas. Aguarde ${limite.retryAfterSeconds}s e tente de novo.`,
    );
  }

  const geracao = await solicitarImagemMarketing(pedido, {
    userId: session.userId,
    correlationId,
  });
  return NextResponse.json(geracao, { status: 202 });
});
