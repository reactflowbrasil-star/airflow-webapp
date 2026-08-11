import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { DomainError } from "@/domain/shared/errors";
import { logger, newCorrelationId } from "@/server/observability/logger";
import { processWebhook } from "@/server/services/payment-service";

interface Ctx {
  params: Promise<{ provider: string }>;
}

/**
 * Endpoint de webhook do PSP (§26).
 *
 * Particularidades em relação às demais rotas:
 *  - lê o corpo BRUTO, antes de qualquer parse, porque a assinatura é
 *    calculada sobre os bytes exatos que o PSP enviou;
 *  - não usa withApiHandler: um erro aqui não pode virar 500 genérico, sob
 *    pena de o PSP reenviar indefinidamente. Respondemos com o código que
 *    instrui o PSP corretamente.
 */
export async function POST(request: Request, ctx: Ctx): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  const { provider } = await ctx.params;

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return apiError(400, "INVALID_BODY", "Corpo ilegível");
  }

  try {
    const result = await processWebhook(provider, rawBody, request.headers, correlationId);

    // 200 mesmo quando não processamos: o evento foi recebido e reconhecido.
    // Reenviar não mudaria o resultado — duplicata continua duplicata.
    return NextResponse.json(
      { received: true, processed: result.processed, reason: result.reason },
      { status: 200, headers: { "x-correlation-id": correlationId } },
    );
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.code === "INVALID_WEBHOOK_SIGNATURE"
    ) {
      // 401: não é evento legítimo. O PSP real não deve reenviar.
      return apiError(401, error.code, "Assinatura inválida");
    }

    // Falha nossa (banco fora, bug): 500 para o PSP reenviar mais tarde.
    logger.error("Falha ao processar webhook — solicitando reenvio ao PSP", {
      correlationId,
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return apiError(500, "WEBHOOK_PROCESSING_FAILED", "Falha temporária. Reenvie.");
  }
}
