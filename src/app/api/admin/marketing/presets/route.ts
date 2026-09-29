import { NextResponse } from "next/server";

import { apiError, withApiHandler } from "@/lib/api";
import { cursorPresetsSchema } from "@/lib/validation/marketing";
import { requireAdmin } from "@/server/auth/rbac";
import { listarPresetsMarketing } from "@/server/services/marketing-image-service";

/**
 * Catálogo de presets do Marketing Studio, página a página.
 *
 * Sempre consultado ao vivo: o provedor gerencia os presets num CMS e muda a
 * visibilidade deles — a documentação proíbe fixar ids no código.
 */
export const GET = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  await requireAdmin();

  const cursor = cursorPresetsSchema.safeParse(
    new URL(request.url).searchParams.get("cursor") || undefined,
  );
  if (!cursor.success) return apiError(422, "VALIDATION_ERROR", "Cursor inválido");

  const pagina = await listarPresetsMarketing(cursor.data, correlationId);
  return NextResponse.json(pagina, { headers: { "cache-control": "no-store" } });
});
