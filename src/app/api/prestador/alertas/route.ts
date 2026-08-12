import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { listProviderDispatchAlerts } from "@/server/services/dispatch-service";

export const GET = withApiHandler(async () => {
  const session = await requireProvider();
  const alerts = await listProviderDispatchAlerts(session.providerProfileId);
  // Origem da direção guiada: a base cadastrada do prestador (ou null).
  const perfil = await prisma.providerProfile.findUnique({
    where: { id: session.providerProfileId },
    select: { baseLatitude: true, baseLongitude: true },
  });
  return NextResponse.json({
    alerts,
    origem: {
      latitude: perfil?.baseLatitude ?? null,
      longitude: perfil?.baseLongitude ?? null,
    },
  });
});
