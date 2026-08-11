import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { resolveDispute } from "@/server/services/dispute-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Resolução de disputa (§33).
 *
 * Delega ao serviço de domínio, que movimenta o saldo bloqueado e registra o
 * lançamento. A rota não toca em dinheiro — só traduz HTTP.
 */
const corpoSchema = z.object({
  resolucao: z.enum([
    "LIBERAR_REPASSE_INTEGRAL",
    "REEMBOLSO_INTEGRAL",
    "REEMBOLSO_PARCIAL",
  ]),
  /** Obrigatório em REEMBOLSO_PARCIAL; ignorado nas demais. */
  valorReembolsoCents: z.number().int().positive().optional(),
  motivo: z.string().max(500).optional(),
});

export const POST = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, request, ctx) => {
    const session = await requireAdmin();
    const { id } = await ctx.params;
    const corpo = await parseJsonBody(request, corpoSchema);

    const disputa = await resolveDispute(
      {
        disputeId: id,
        resolution: corpo.resolucao,
        refundAmountCents: corpo.valorReembolsoCents,
        resolvedBy: session.userId,
        resolutionNotes: corpo.motivo,
      },
      correlationId,
    );

    return NextResponse.json({ disputa: { id: disputa.id, status: disputa.status } });
  },
);
