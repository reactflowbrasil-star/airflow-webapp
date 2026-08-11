import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { alternarCategoria } from "@/server/services/admin-service";

type Ctx = { params: Promise<{ id: string }> };

/** Desativar remove das buscas sem apagar histórico. */
const corpoSchema = z.object({ ativa: z.boolean() });

export const PATCH = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, request, ctx) => {
    const session = await requireAdmin();
    const { id } = await ctx.params;
    const { ativa } = await parseJsonBody(request, corpoSchema);

    const registro = await alternarCategoria(id, ativa, {
      userId: session.userId,
      correlationId,
    });

    return NextResponse.json({ id: registro.id, active: registro.active });
  },
);
