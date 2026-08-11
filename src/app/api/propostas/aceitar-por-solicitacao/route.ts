import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { DomainError } from "@/domain/shared/errors";
import { ForbiddenError, requireSession } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { acceptProposal, rejectProposal } from "@/server/services/proposal-service";

const schema = z.object({
  requestId: z.string().min(1),
  providerId: z.string().min(1),
  action: z.enum(["ACEITAR", "RECUSAR"]),
});

/**
 * Aceita ou recusa a última proposta de uma negociação sem que o cliente
 * precise conhecer o id da proposta — o prestador vê a solicitação, não a
 * proposta. A resolução do alvo é feita no servidor.
 */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireSession();
  const input = await parseJsonBody(request, schema);

  if (session.role === "PROVIDER") {
    if (input.providerId !== session.providerProfileId) {
      throw new ForbiddenError("Não é possível responder em nome de outro prestador");
    }
  } else if (session.role === "CUSTOMER") {
    const solicitacao = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: input.requestId },
      select: { customerId: true },
    });
    if (solicitacao.customerId !== session.customerProfileId) {
      throw new ForbiddenError("Solicitação não pertence a este cliente");
    }
  } else {
    throw new ForbiddenError("Administradores não participam da negociação");
  }

  const ultima = await prisma.proposal.findFirst({
    where: { requestId: input.requestId, providerId: input.providerId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!ultima) {
    throw new DomainError("PROPOSAL_NOT_FOUND", "Negociação sem propostas");
  }

  const actor = session.role === "CUSTOMER" ? "CLIENTE" : "PRESTADOR";

  if (input.action === "ACEITAR") {
    const order = await acceptProposal(ultima.id, actor, correlationId);
    return NextResponse.json({ order }, { status: 201 });
  }
  const proposal = await rejectProposal(ultima.id, actor, correlationId);
  return NextResponse.json({ proposal });
});
