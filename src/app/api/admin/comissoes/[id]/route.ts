import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { desativarRegraComissao } from "@/server/services/admin-service";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE desativa; não apaga. Snapshots antigos precisam da regra legível. */
export const DELETE = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, _request, ctx) => {
    const session = await requireAdmin();
    const { id } = await ctx.params;

    const regra = await desativarRegraComissao(id, {
      userId: session.userId,
      correlationId,
    });

    return NextResponse.json({ regra: { id: regra.id, active: regra.active } });
  },
);
