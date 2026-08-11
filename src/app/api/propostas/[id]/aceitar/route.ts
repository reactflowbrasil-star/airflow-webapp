import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { ForbiddenError, requireSession } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { acceptProposal } from "@/server/services/proposal-service";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Aceite da proposta — o ponto em que a negociação vira dinheiro.
 * Só as duas partes da negociação podem aceitar, e nunca a própria proposta.
 */
export const POST = withApiHandler<[Request, Ctx]>(
  async ({ correlationId }, _request, ctx) => {
    const session = await requireSession();
    const { id } = await ctx.params;

    const proposal = await prisma.proposal.findUniqueOrThrow({
      where: { id },
      select: { providerId: true, request: { select: { customerId: true } } },
    });

    if (session.role === "CUSTOMER") {
      if (proposal.request.customerId !== session.customerProfileId) {
        throw new ForbiddenError("Proposta não pertence a este cliente");
      }
    } else if (session.role === "PROVIDER") {
      if (proposal.providerId !== session.providerProfileId) {
        throw new ForbiddenError("Proposta não pertence a este prestador");
      }
    } else {
      throw new ForbiddenError("Administradores não aceitam propostas");
    }

    const order = await acceptProposal(
      id,
      session.role === "CUSTOMER" ? "CLIENTE" : "PRESTADOR",
      correlationId,
    );

    return NextResponse.json({ order }, { status: 201 });
  },
);
