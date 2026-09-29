import { NextResponse } from "next/server";

import { apiError, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import {
  clienteDoAdmin,
  comErroHiggsfield,
  exigirMesmaOrigem,
  semCache,
} from "@/server/higgsfield/http";
import { cancelarGeracao } from "@/server/services/estudio-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Cancela na Higgsfield (`POST /requests/{id}/cancel`). Parar de consultar
 * não cancela nada — o pedido tem de chegar à API. Só vale para geração na
 * fila; geração alheia responde 404.
 */
export const POST = withApiHandler<[Request, Ctx]>(async ({ correlationId }, request, { params }) => {
  exigirMesmaOrigem(request);
  const session = await requireAdmin();
  const { id } = await params;
  const cliente = await clienteDoAdmin(session.userId, correlationId);

  return comErroHiggsfield(async () => {
    const geracao = await cancelarGeracao({
      userId: session.userId,
      geracaoId: id,
      cliente,
      correlationId,
    });
    if (!geracao) return apiError(404, "NOT_FOUND", "Geração não encontrada");
    return semCache(NextResponse.json({ geracao }));
  });
});
