import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import {
  completePayout,
  failPayout,
  processPayout,
} from "@/server/services/payout-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Execução de repasse (§28).
 *
 * Cada ação delega ao serviço financeiro, que faz o lançamento no ledger e
 * respeita a máquina de estado — REQUESTED → PROCESSING → PAID/FAILED. A rota
 * não move saldo por conta própria.
 */
const corpoSchema = z.object({
  acao: z.enum(["processar", "concluir", "falhar"]),
  motivo: z.string().max(500).optional(),
  /** Comprovante do banco, quando houver. */
  referenciaExterna: z.string().max(200).optional(),
});

export const POST = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, request, ctx) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const corpo = await parseJsonBody(request, corpoSchema);

    const repasse =
      corpo.acao === "processar"
        ? await processPayout(id, correlationId)
        : corpo.acao === "concluir"
          ? await completePayout(id, corpo.referenciaExterna ?? `manual-${id}`, correlationId)
          : await failPayout(id, corpo.motivo ?? "Falha registrada pelo painel", correlationId);

    return NextResponse.json({ repasse: { id: repasse.id, status: repasse.status } });
  },
);
