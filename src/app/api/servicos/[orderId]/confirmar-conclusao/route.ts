import { NextResponse } from "next/server";

import { apiError, withApiHandler } from "@/lib/api";
import { requireCustomer } from "@/server/auth/rbac";
import { runCustomerCompletionAction } from "@/server/services/execution-service";

export const POST = withApiHandler<[
  Request,
  { params: Promise<{ orderId: string }> },
]>(async ({ correlationId }, _request, { params }) => {
  const session = await requireCustomer();
  const { orderId } = await params;
  const result = await runCustomerCompletionAction(
    orderId,
    session.customerProfileId,
    correlationId,
  );

  if (!result) {
    return apiError(404, "NOT_FOUND", "Serviço não encontrado");
  }

  return NextResponse.json({
    service: { orderId, status: result.status },
  });
});
