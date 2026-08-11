import { NextResponse } from "next/server";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { createProposalSchema } from "@/lib/validation/marketplace";
import { ForbiddenError, requireSession } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { createProposal } from "@/server/services/proposal-service";

/**
 * Cliente e prestador usam a mesma rota; o autor vem da sessão, nunca do
 * corpo — do contrário um lado poderia forjar proposta em nome do outro.
 */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireSession();
  const input = await parseJsonBody(request, createProposalSchema);

  if (session.role === "CUSTOMER") {
    const solicitacao = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: input.requestId },
      select: { customerId: true },
    });
    if (solicitacao.customerId !== session.customerProfileId) {
      throw new ForbiddenError("Solicitação não pertence a este cliente");
    }
  } else if (session.role === "PROVIDER") {
    if (input.providerId !== session.providerProfileId) {
      throw new ForbiddenError("Não é possível propor em nome de outro prestador");
    }
  } else {
    throw new ForbiddenError("Administradores não participam da negociação");
  }

  const proposal = await createProposal(
    {
      requestId: input.requestId,
      providerId: input.providerId,
      author: session.role === "CUSTOMER" ? "CLIENTE" : "PRESTADOR",
      amountCents: input.amountCents,
      message: input.message,
      estimatedDurationMinutes: input.estimatedDurationMinutes,
    },
    correlationId,
  );

  return NextResponse.json({ proposal }, { status: 201 });
});
