import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { iniciarSessaoFacial } from "@/server/services/facial-verification-service";
import { setFacialSessionCookie } from "@/server/verification/facial-session";

/**
 * Abre a sessão de validação facial (§8). A sessão do provedor fica num
 * cookie httpOnly assinado de 10 min ligado a este prestador — o `validar`
 * não aceita sessão criada por outro.
 */
export const POST = withApiHandler(async () => {
  const session = await requireProvider();
  const { sessaoId, modo } = await iniciarSessaoFacial(session.providerProfileId);

  await setFacialSessionCookie({
    providerProfileId: session.providerProfileId,
    sessaoId,
  });

  return NextResponse.json({ sessaoId, modo });
});
