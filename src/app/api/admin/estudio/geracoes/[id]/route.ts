import { NextResponse } from "next/server";

import { apiError, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { criarClienteHiggsfield } from "@/server/higgsfield/cliente";
import { lerChaveHiggsfield } from "@/server/higgsfield/credencial";
import { comErroHiggsfield, semCache } from "@/server/higgsfield/http";
import { atualizarGeracao } from "@/server/services/estudio-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Status de uma geração (o poll do navegador passa por aqui, nunca direto na
 * Higgsfield). Geração de outro usuário responde 404 — a posse é filtrada na
 * própria consulta. Sem chave conectada, devolve o último estado conhecido.
 */
export const GET = withApiHandler<[Request, Ctx]>(async ({ correlationId }, _request, { params }) => {
  const session = await requireAdmin();
  const { id } = await params;
  const apiKey = await lerChaveHiggsfield(session.userId);
  const cliente = apiKey ? criarClienteHiggsfield({ apiKey, correlationId }) : null;

  return comErroHiggsfield(async () => {
    const geracao = await atualizarGeracao({
      userId: session.userId,
      geracaoId: id,
      cliente,
      correlationId,
    });
    if (!geracao) return apiError(404, "NOT_FOUND", "Geração não encontrada");
    return semCache(NextResponse.json({ geracao, chaveAusente: !cliente && !geracao.terminal }));
  });
});
