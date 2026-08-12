import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { validarSelfieFacial } from "@/server/services/facial-verification-service";
import {
  clearFacialSessionCookie,
  verificarFacialSession,
} from "@/server/verification/facial-session";

/**
 * Envia a selfie capturada para análise biométrica (§8). A sessão facial vem
 * do cookie assinado criado no `iniciar` — sem sessão válida (expirada ou de
 * outro prestador) a validação é recusada com mensagem não-oráculo.
 */
const bodySchema = z.object({
  selfie: z.string(),
});

export const POST = withApiHandler<[Request]>(
  async ({ correlationId }, request) => {
    const session = await requireProvider();
    const body = await parseJsonBody(request, bodySchema);

    const cookie = request.headers.get("cookie") ?? "";
    const token = cookie
      .split(";")
      .map((parte) => parte.trim())
      .find((parte) => parte.startsWith("facial_session="))
      ?.slice("facial_session=".length);

    const sessao = token ? await verificarFacialSession(token) : null;
    if (!sessao || sessao.providerProfileId !== session.providerProfileId) {
      return apiError(
        422,
        "FACIAL_SESSION_INVALID",
        "Sessão de validação expirada ou inválida. Inicie novamente.",
      );
    }

    try {
      const resultado = await validarSelfieFacial(
        session.providerProfileId,
        sessao.sessaoId,
        body.selfie,
        correlationId,
      );

      // Sessão de uso único: some em qualquer desfecho (sem replay).
      return NextResponse.json(resultado);
    } finally {
      await clearFacialSessionCookie();
    }
  },
);
