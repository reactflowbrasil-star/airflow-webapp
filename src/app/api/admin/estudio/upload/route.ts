import { NextResponse } from "next/server";
import { z } from "zod";

import { TIPOS_REFERENCIA } from "@/domain/estudio/catalogo";
import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import {
  clienteDoAdmin,
  comErroHiggsfield,
  exigirMesmaOrigem,
  semCache,
} from "@/server/higgsfield/http";

/**
 * Prepara o upload de uma imagem de referência: pede à Higgsfield, com a
 * chave do admin, uma URL assinada de storage. O navegador faz o PUT direto
 * nela com os headers devolvidos e sem credenciais — o storage nunca recebe a
 * chave de API. A URL assinada é credencial de escrita: não vai para log e a
 * resposta não entra em cache.
 */

const corpoSchema = z.object({ contentType: z.enum(TIPOS_REFERENCIA) });

export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  exigirMesmaOrigem(request);
  const session = await requireAdmin();
  const { contentType } = await parseJsonBody(request, corpoSchema);
  const cliente = await clienteDoAdmin(session.userId, correlationId);

  return comErroHiggsfield(async () => {
    const ticket = await cliente.criarUpload(contentType);
    return semCache(NextResponse.json({ ticket }));
  });
});
