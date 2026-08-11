import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { verifyInboundRequest, WebhookAuthError } from "@/server/events";
import { newCorrelationId } from "@/server/observability/logger";
import { runReconciliation } from "@/server/services/payout-service";

/** Conciliação periódica (§32), agendada pelo n8n (WF-15). */
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

  const fim = new Date();
  const inicio = new Date(fim.getTime() - 24 * 3_600_000);
  const { run, divergences } = await runReconciliation(
    process.env.PAYMENT_PROVIDER ?? "sandbox",
    inicio,
    fim,
    newCorrelationId(),
  );
  return NextResponse.json({
    run_id: run.id,
    status: run.status,
    divergences: divergences.length,
  });
}
