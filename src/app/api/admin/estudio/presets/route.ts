import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { clienteDoAdmin, comErroHiggsfield, semCache } from "@/server/higgsfield/http";

/**
 * Presets visíveis do Marketing Studio (modo `enhance_prompt`). A doc manda
 * buscar a lista viva com a mesma credencial — o CMS muda a visibilidade, então
 * nada de UUID fixo no código. Paginação pelo `cursor` devolvido.
 */
export const GET = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireAdmin();
  const cursor = new URL(request.url).searchParams.get("cursor");
  const cliente = await clienteDoAdmin(session.userId, correlationId);

  return comErroHiggsfield(async () => {
    const pagina = await cliente.listarPresets(cursor && cursor.length <= 512 ? cursor : null);
    return semCache(NextResponse.json(pagina));
  });
});
