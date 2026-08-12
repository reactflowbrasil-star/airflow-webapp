import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";

/**
 * Foto do perfil do prestador.
 *
 * A imagem chega como data URL (o cliente redimensiona para 512×512 e
 * converte para JPEG antes de enviar — sem upload de arquivo cru). Aqui só se
 * valida formato e tamanho e grava em `User.avatarUrl`, que já existia no
 * schema e não exige migration. `null` remove a foto.
 *
 * Limites: JPEG/PNG/WebP, data URL ≤ 1 MB e payload decodificado ≤ 512 KB —
 * o avatar vive no banco, então o tamanho é a defesa contra inflar a tabela.
 */

const dataUrlSchema = z
  .string()
  .max(1_000_000)
  .refine(
    (value) => /^data:image\/(png|jpeg|jpg|webp);base64,/.test(value),
    "Formato de imagem inválido",
  );

const bodySchema = z.object({
  avatarUrl: z.union([z.null(), dataUrlSchema]),
});

const MAX_BYTES = 512 * 1024;

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  // Cada 4 caracteres base64 ≈ 3 bytes; arredonda para cima com padding.
  return Math.ceil((base64.length * 3) / 4);
}

export const PATCH = withApiHandler<[Request]>(async (_ctx, request) => {
  const session = await requireProvider();
  const body = await parseJsonBody(request, bodySchema);

  if (body.avatarUrl !== null && dataUrlBytes(body.avatarUrl) > MAX_BYTES) {
    return apiError(422, "AVATAR_TOO_LARGE", "Imagem muito grande (máx. 512 KB)");
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: { avatarUrl: body.avatarUrl },
    select: { avatarUrl: true },
  });

  return NextResponse.json({ avatarUrl: user.avatarUrl });
});
