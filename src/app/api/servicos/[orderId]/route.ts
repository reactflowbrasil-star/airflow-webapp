import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { runProviderOrderAction } from "@/server/services/execution-service";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SCHEDULE"), scheduledAt: z.coerce.date() }),
  z.object({ type: z.literal("START") }),
  z.object({ type: z.literal("REQUEST_COMPLETION") }),
]);

export const POST = withApiHandler<[
  Request,
  { params: Promise<{ orderId: string }> },
]>(async ({ correlationId }, request, { params }) => {
  const session = await requireProvider();
  const action = await parseJsonBody(request, actionSchema);
  const { orderId } = await params;
  const result = await runProviderOrderAction(
    orderId,
    session.providerProfileId,
    action,
    correlationId,
  );

  if (!result) return apiError(404, "NOT_FOUND", "Serviço não encontrado");
  return NextResponse.json({ service: { orderId, status: result.status } });
});
