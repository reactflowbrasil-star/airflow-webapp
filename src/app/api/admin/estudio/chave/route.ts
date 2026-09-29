import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizarChaveApi } from "@/domain/estudio/chave";
import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { removerChaveHiggsfield, salvarChaveHiggsfield } from "@/server/higgsfield/credencial";
import { exigirMesmaOrigem, semCache } from "@/server/higgsfield/http";
import { registrarAuditoriaChave } from "@/server/services/estudio-service";

/**
 * Connect API key / Replace API key / Remove API key do Estúdio.
 *
 * A resposta nunca devolve a chave — nem mascarada. Salvar também não prova
 * que ela vale: quem confirma é a Higgsfield, na primeira chamada.
 */

const corpoSchema = z.object({ apiKey: z.string().max(4096) });

export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  exigirMesmaOrigem(request);
  const session = await requireAdmin();
  const { apiKey } = await parseJsonBody(request, corpoSchema);
  await salvarChaveHiggsfield(normalizarChaveApi(apiKey), session.userId);
  await registrarAuditoriaChave(session.userId, "HIGGSFIELD_CHAVE_CONECTADA", correlationId);
  return semCache(NextResponse.json({ salva: true }));
});

export const DELETE = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  exigirMesmaOrigem(request);
  const session = await requireAdmin();
  await removerChaveHiggsfield();
  await registrarAuditoriaChave(session.userId, "HIGGSFIELD_CHAVE_REMOVIDA", correlationId);
  return semCache(NextResponse.json({ salva: false }));
});
