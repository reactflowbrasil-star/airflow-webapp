import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { listProviderDispatchAlerts } from "@/server/services/dispatch-service";

export const GET = withApiHandler(async () => {
  const session = await requireProvider();
  const alerts = await listProviderDispatchAlerts(session.providerProfileId);
  return NextResponse.json({ alerts });
});
