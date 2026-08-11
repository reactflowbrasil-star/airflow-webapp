import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { reenfileirarEvento } from "@/server/services/admin-service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, _request, ctx) => {
    const session = await requireAdmin();
    const { id } = await ctx.params;

    const evento = await reenfileirarEvento(id, {
      userId: session.userId,
      correlationId,
    });

    return NextResponse.json({ evento: { id: evento.id, status: evento.status } });
  },
);
