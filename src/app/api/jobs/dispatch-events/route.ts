import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import {
  dispatchPendingEvents,
  verifyInboundRequest,
  WebhookAuthError,
} from "@/server/events";

/**
 * Despacha o outbox para o n8n. Agendado pelo próprio n8n (WF-14) ou por
 * cron externo — autenticado com o mesmo esquema HMAC dos comandos.
 */
export async function POST(request: Request): Promise<NextResponse> {
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

  const result = await dispatchPendingEvents();
  return NextResponse.json(result);
}
