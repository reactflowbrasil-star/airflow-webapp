import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { clienteDoAdmin, exigirMesmaOrigem, semCache } from "@/server/higgsfield/http";
import { enviarGeracao } from "@/server/services/estudio-service";

/**
 * Submete uma geração à Higgsfield.
 *
 * O `idempotencyKey` vem do navegador (um por intenção de gerar). Repetir a
 * mesma chave devolve a geração existente com 200 — nunca um segundo POST
 * cobrado. A entrada é validada contra o schema do modelo no serviço.
 */

const corpoSchema = z.object({
  idempotencyKey: z.uuid(),
  modelo: z.string().max(200),
  entrada: z.record(z.string(), z.unknown()),
});

export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  exigirMesmaOrigem(request);
  const session = await requireAdmin();
  const corpo = await parseJsonBody(request, corpoSchema);
  const cliente = await clienteDoAdmin(session.userId, correlationId);

  const { geracao, repetida, tipoFalha } = await enviarGeracao({
    userId: session.userId,
    idempotencyKey: corpo.idempotencyKey,
    modelo: corpo.modelo,
    entrada: corpo.entrada,
    cliente,
    correlationId,
  });

  return semCache(
    NextResponse.json({ geracao, repetida, tipoFalha }, { status: repetida ? 200 : 201 }),
  );
});
