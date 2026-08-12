import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { verifyInboundRequest, WebhookAuthError } from "@/server/events";
import { expirarOfertasVencidas } from "@/server/services/dispatch-service";
import { logger, newCorrelationId } from "@/server/observability/logger";

/**
 * Job de timeout da oferta (modelo Uber) — chamado por cron externo ou por um
 * workflow do n8n, autenticado com o mesmo esquema HMAC dos comandos.
 *
 * Processa:
 *   1. Negociações com lock vencido → a solicitação reabre e os próximos
 *      candidatos são alertados (redistribuição automática);
 *   2. Solicitações abertas sem resposta dentro do prazo → EXPIRADA e o
 *      dispatch encerra.
 *
 * Recomendado: executar a cada 5 minutos.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return apiError(400, "INVALID_BODY", "Corpo ilegível");
  }

  try {
    await verifyInboundRequest(rawBody, request.headers);
  } catch (error) {
    if (error instanceof WebhookAuthError) {
      return apiError(401, "WEBHOOK_AUTH_FAILED", error.message);
    }
    throw error;
  }

  const result = await expirarOfertasVencidas(correlationId);
  logger.info("Job de timeouts concluído", { correlationId, ...result });
  return NextResponse.json(result);
}
