import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireCustomer } from "@/server/auth/rbac";
import { cancelServiceRequest } from "@/server/services/request-service";

/**
 * Cancelamento da solicitação pelo cliente (§10). A máquina de estados é a
 * trava — só ABERTA/EM_NEGOCIACAO passam; ordem já contratada não passa por
 * aqui. O dispatch em curso é encerrado e os candidatos fechados.
 */
export const DELETE = withApiHandler<
  [Request, { params: Promise<{ id: string }> }]
>(async ({ correlationId }, _request, { params }) => {
  const session = await requireCustomer();
  const { id } = await params;

  const updated = await cancelServiceRequest(
    id,
    session.customerProfileId,
    session.userId,
    correlationId,
  );

  return NextResponse.json({ request: { id: updated.id, status: updated.status } });
});
