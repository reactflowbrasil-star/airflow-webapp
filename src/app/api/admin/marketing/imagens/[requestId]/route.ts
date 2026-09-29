import { NextResponse } from "next/server";

import { apiError, withApiHandler } from "@/lib/api";
import { requestIdSchema } from "@/lib/validation/marketing";
import { requireAdmin } from "@/server/auth/rbac";
import { consultarImagemMarketing } from "@/server/services/marketing-image-service";

type Ctx = { params: Promise<{ requestId: string }> };

/**
 * Estado de uma geração do estúdio — é o que o painel consulta no polling.
 *
 * Geração que não nasceu no AirFlow responde 404, como id fora do formato:
 * o id vira path na API do provedor, e a chave da plataforma não serve para
 * consultar requisição alheia da conta.
 */
export const GET = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, _request, ctx) => {
    const session = await requireAdmin();
    const { requestId } = await ctx.params;

    if (!requestIdSchema.safeParse(requestId).success) {
      return apiError(404, "NOT_FOUND", "Geração não encontrada");
    }

    const geracao = await consultarImagemMarketing(requestId, {
      userId: session.userId,
      correlationId,
    });
    if (!geracao) return apiError(404, "NOT_FOUND", "Geração não encontrada");

    return NextResponse.json(geracao, { headers: { "cache-control": "no-store" } });
  },
);
