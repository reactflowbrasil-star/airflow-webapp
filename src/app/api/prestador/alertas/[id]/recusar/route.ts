import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { declineDispatchAlert } from "@/server/services/dispatch-service";

/**
 * Recusa explícita da oferta (§16) — a fila roda na hora: quem recusou vai
 * para o fim e os próximos candidatos são notificados, sem esperar o timeout
 * do lock.
 */
export const POST = withApiHandler<
  [Request, { params: Promise<{ id: string }> }]
>(async ({ correlationId }, _request, { params }) => {
  const session = await requireProvider();
  const { id } = await params;
  const result = await declineDispatchAlert(
    id,
    session.providerProfileId,
    correlationId,
  );
  return NextResponse.json(result);
});
