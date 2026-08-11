import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { acceptDispatchAlert } from "@/server/services/dispatch-service";

export const POST = withApiHandler<
  [Request, { params: Promise<{ id: string }> }]
>(async ({ correlationId }, _request, { params }) => {
  const session = await requireProvider();
  const { id } = await params;
  const proposal = await acceptDispatchAlert(
    id,
    session.providerProfileId,
    correlationId,
  );
  return NextResponse.json({ proposal }, { status: 201 });
});
