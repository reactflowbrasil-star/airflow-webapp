/**
 * Eventos de integração com o n8n (padrão outbox).
 *
 * O evento é gravado na MESMA transação da mudança de estado — ou ambos
 * acontecem, ou nenhum. A entrega ao n8n é assíncrona, com retry exponencial
 * e dead-letter. O backend permanece a fonte de verdade; perder o n8n atrasa
 * notificações, nunca corrompe estado.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

type Db = Prisma.TransactionClient;

/** Catálogo de eventos emitidos (contrato documentado em docs/N8N-INTEGRATION.md). */
export type OutboundEventType =
  | "proposal.created"
  | "proposal.countered"
  | "proposal.accepted"
  | "proposal.rejected"
  | "negotiation.completed"
  | "payment.requested"
  | "payment.created"
  | "payment.confirmed"
  | "payment.failed"
  | "service.released"
  | "service.en_route"
  | "service.arrived"
  | "service.started"
  | "service.completed_requested"
  | "service.completed"
  | "dispute.created"
  | "dispute.resolved"
  | "payout.requested"
  | "payout.processing"
  | "payout.completed"
  | "payout.failed"
  | "review.requested"
  | "commission.rule_changed"
  | "phone.verification_requested"
  | "dispatch.started"
  | "dispatch.locked"
  | "dispatch.released"
  | "request.expired";

export interface EmitInput {
  type: OutboundEventType;
  /** Payload mínimo e sanitizado: ids e valores — NUNCA contatos ou segredos. */
  data: Record<string, unknown>;
  correlationId?: string;
  /** Dedup do fato de negócio, ex.: `proposal.accepted:<proposalId>`. */
  idempotencyKey: string;
}

/** Grava o evento no outbox dentro da transação do chamador. Idempotente. */
export async function emitEvent(db: Db, input: EmitInput): Promise<void> {
  try {
    await db.outboundEvent.create({
      data: {
        eventType: input.type,
        payload: input.data as Prisma.InputJsonValue,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  } catch (error) {
    if (isUnique(error)) {
      // Mesmo fato emitido de novo (retry do chamador) — zero efeito extra.
      return;
    }
    throw error;
  }
}

function isUnique(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// Entrega (dispatcher) — backend → n8n
// ---------------------------------------------------------------------------

/** Retry: imediata, +30s, +2min, +10min, +30min; depois DEAD_LETTER. */
const BACKOFF_SECONDS = [0, 30, 120, 600, 1800] as const;
const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

export function signOutbound(body: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export interface DispatchResult {
  delivered: number;
  failed: number;
  deadLettered: number;
}

/**
 * Entrega eventos pendentes ao n8n. Chamado pelo job autenticado
 * (POST /api/jobs/dispatch-events — o próprio n8n agenda via WF-14) e é
 * seguro rodar em concorrência: cada linha é "reivindicada" com update
 * condicional antes do envio.
 */
export async function dispatchPendingEvents(
  now: Date = new Date(),
  limit = 20,
): Promise<DispatchResult> {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) {
    logger.warn("N8N_WEBHOOK_URL/SECRET ausentes — entrega de eventos suspensa");
    return { delivered: 0, failed: 0, deadLettered: 0 };
  }

  const pending = await prisma.outboundEvent.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const result: DispatchResult = { delivered: 0, failed: 0, deadLettered: 0 };

  for (const event of pending) {
    // Claim: se outra execução pegou este evento, o count vem 0 e pulamos.
    const claimed = await prisma.outboundEvent.updateMany({
      where: { id: event.id, status: "PENDING", attempts: event.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const envelope = JSON.stringify({
      event_id: event.id,
      event_type: event.eventType,
      event_version: event.eventVersion,
      created_at: event.createdAt.toISOString(),
      correlation_id: event.correlationId,
      idempotency_key: event.idempotencyKey,
      source: "backend",
      data: event.payload,
    });
    const timestamp = String(Math.floor(now.getTime() / 1000));

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-airflow-timestamp": timestamp,
          "x-airflow-signature": signOutbound(envelope, timestamp, secret),
          "x-airflow-event-id": event.id,
        },
        body: envelope,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`n8n respondeu ${response.status}`);

      await prisma.outboundEvent.update({
        where: { id: event.id },
        data: { status: "DELIVERED", deliveredAt: new Date(), lastError: null },
      });
      result.delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = event.attempts + 1; // já incrementado no claim

      if (attempt >= MAX_ATTEMPTS) {
        await prisma.outboundEvent.update({
          where: { id: event.id },
          data: { status: "DEAD_LETTER", lastError: message },
        });
        result.deadLettered += 1;
        logger.error("Evento enviado à dead-letter após esgotar tentativas", {
          correlationId: event.correlationId ?? undefined,
          eventId: event.id,
          eventType: event.eventType,
          error: message,
        });
      } else {
        await prisma.outboundEvent.update({
          where: { id: event.id },
          data: {
            lastError: message,
            nextAttemptAt: new Date(now.getTime() + BACKOFF_SECONDS[attempt] * 1000),
          },
        });
        result.failed += 1;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Verificação de entrada — n8n → backend (e jobs)
// ---------------------------------------------------------------------------

/** Janela de tolerância do timestamp: fora dela é replay ou relógio quebrado. */
const MAX_SKEW_SECONDS = 300;
const NONCE_TTL_MS = 15 * 60 * 1000;

export class WebhookAuthError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = "WebhookAuthError";
  }
}

/**
 * Valida HMAC + timestamp + nonce de uma chamada do n8n.
 *
 * Assinatura esperada: HMAC-SHA256(`${timestamp}.${nonce}.${rawBody}`) com
 * BACKEND_WEBHOOK_SECRET. O nonce é gravado com unique — replay com a mesma
 * assinatura é recusado pelo banco, não por memória de processo.
 */
export async function verifyInboundRequest(
  rawBody: string,
  headers: Headers,
): Promise<void> {
  const secret = process.env.BACKEND_WEBHOOK_SECRET;
  if (!secret || secret.length < 16) {
    throw new WebhookAuthError("BACKEND_WEBHOOK_SECRET não configurado");
  }

  const signature = headers.get("x-n8n-signature");
  const timestamp = headers.get("x-n8n-timestamp");
  const nonce = headers.get("x-n8n-nonce");
  if (!signature || !timestamp || !nonce) {
    throw new WebhookAuthError("Cabeçalhos de assinatura ausentes");
  }

  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(skew) || skew > MAX_SKEW_SECONDS) {
    throw new WebhookAuthError("Timestamp fora da janela permitida");
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new WebhookAuthError("Assinatura inválida");
  }

  try {
    await prisma.idempotencyKey.create({
      data: {
        key: `n8n-nonce:${nonce}`,
        scope: "n8n-webhook-nonce",
        requestHash: signature,
        locked: false,
        expiresAt: new Date(Date.now() + NONCE_TTL_MS),
      },
    });
  } catch (error) {
    if (isUnique(error)) {
      throw new WebhookAuthError("Nonce já utilizado (replay)");
    }
    throw error;
  }
}
