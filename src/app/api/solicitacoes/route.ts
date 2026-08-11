import { NextResponse } from "next/server";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { createRequestSchema } from "@/lib/validation/marketplace";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { createProposal } from "@/server/services/proposal-service";
import { createServiceRequest } from "@/server/services/request-service";

export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireCustomer();
  const input = await parseJsonBody(request, createRequestSchema);

  const created = await createServiceRequest(
    { ...input, customerId: session.customerProfileId },
    correlationId,
  );

  // Solicitação dirigida a um técnico já vira proposta inicial do cliente (§13)
  if (input.providerId) {
    await createProposal(
      {
        requestId: created.id,
        providerId: input.providerId,
        author: "CLIENTE",
        amountCents: input.proposedPriceCents,
      },
      correlationId,
    );
  }

  return NextResponse.json({ request: created }, { status: 201 });
});

export const GET = withApiHandler(async () => {
  const session = await requireCustomer();

  const requests = await prisma.serviceRequest.findMany({
    where: { customerId: session.customerProfileId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { name: true, slug: true } },
      order: { select: { id: true, status: true, grossAmountCents: true } },
      _count: { select: { proposals: true } },
    },
  });

  return NextResponse.json({ requests });
});
