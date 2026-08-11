import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { alterarStatusUsuario } from "@/server/services/admin-service";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({
  novoStatus: z.enum(["ACTIVE", "SUSPENDED", "BLOCKED"]),
  motivo: z.string().max(500).optional(),
});

export const POST = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, request, ctx) => {
    const session = await requireAdmin();
    const { id } = await ctx.params;
    const { novoStatus, motivo } = await parseJsonBody(request, corpoSchema);

    const usuario = await alterarStatusUsuario(id, novoStatus, motivo, {
      userId: session.userId,
      correlationId,
    });

    return NextResponse.json({ usuario: { id: usuario.id, status: usuario.status } });
  },
);
