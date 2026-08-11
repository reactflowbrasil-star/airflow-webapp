import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import {
  alterarStatusPrestador,
  decidirCadastroPrestador,
} from "@/server/services/admin-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Decisão sobre o cadastro de um prestador (§8).
 *
 * União discriminada: ou é a decisão da fila de análise, ou é uma mudança de
 * status de quem já foi aprovado. Aceitar os dois no mesmo objeto solto
 * permitiria "aprovar" alguém direto de BLOQUEADO.
 */
const corpoSchema = z.union([
  z.object({
    decisao: z.enum(["APROVADO", "REJEITADO"]),
    motivo: z.string().max(500).optional(),
  }),
  z.object({
    novoStatus: z.enum(["APROVADO", "SUSPENSO", "BLOQUEADO"]),
    motivo: z.string().max(500).optional(),
  }),
]);

export const POST = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, request, ctx) => {
    const session = await requireAdmin();
    const { id } = await ctx.params;
    const corpo = await parseJsonBody(request, corpoSchema);
    const autor = { userId: session.userId, correlationId };

    const resultado =
      "decisao" in corpo
        ? await decidirCadastroPrestador(id, corpo.decisao, corpo.motivo, autor)
        : await alterarStatusPrestador(id, corpo.novoStatus, corpo.motivo, autor);

    return NextResponse.json({ prestador: { id: resultado.id, status: resultado.status } });
  },
);
