import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { verifyInboundRequest, WebhookAuthError } from "@/server/events";
import { logger, newCorrelationId } from "@/server/observability/logger";
import {
  acceptProposal,
  createProposal,
  rejectProposal,
} from "@/server/services/proposal-service";
import { createCheckout } from "@/server/services/payment-service";
import {
  confirmServiceCompletion,
  markProviderEnRoute,
  requestServiceCompletion,
  scheduleService,
  startService,
} from "@/server/services/execution-service";
import { openDispute, resolveDispute } from "@/server/services/dispute-service";
import {
  completePayout,
  failPayout,
  processPayout,
} from "@/server/services/payout-service";

/**
 * Porta de comandos do n8n (n8n → backend).
 *
 * O n8n NUNCA muda estado direto no banco: todo comando passa por aqui, é
 * autenticado (HMAC + timestamp + nonce anti-replay), validado por Zod e
 * executado pelos MESMOS serviços que a UI usa — máquina de estados,
 * auditoria e idempotência incluídas. Regra crítica alguma vive só no n8n.
 */

const comandoSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("proposta.responder"),
    request_id: z.string().min(1),
    provider_id: z.string().min(1),
    actor: z.enum(["CLIENTE", "PRESTADOR"]),
    action: z.enum(["ACEITAR", "CONTRAPROPOSTA", "RECUSAR"]),
    /** Id da proposta alvo (obrigatório para ACEITAR/RECUSAR). */
    proposal_id: z.string().optional(),
    amount_cents: z.number().int().positive().optional(),
    message: z.string().max(1000).optional(),
  }),
  z.object({
    command: z.literal("pagamento.criar"),
    order_id: z.string().min(1),
    method: z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO"]).default("PIX"),
  }),
  z.object({
    command: z.literal("ordem.agendar"),
    order_id: z.string().min(1),
    scheduled_at: z.coerce.date(),
  }),
  z.object({
    command: z.literal("ordem.iniciar"),
    order_id: z.string().min(1),
    eta_minutes: z.number().int().min(5).max(240).optional(),
  }),
  z.object({
    command: z.literal("ordem.solicitar_conclusao"),
    order_id: z.string().min(1),
  }),
  z.object({
    command: z.literal("ordem.confirmar_conclusao"),
    order_id: z.string().min(1),
  }),
  z.object({
    command: z.literal("disputa.abrir"),
    order_id: z.string().min(1),
    reason: z.enum([
      "TECNICO_NAO_COMPARECEU",
      "SERVICO_INCOMPLETO",
      "EQUIPAMENTO_DANIFICADO",
      "COBRANCA_DIVERGENTE",
      "PROBLEMA_QUALIDADE",
      "CANCELAMENTO",
      "OUTRO",
    ]),
    description: z.string().min(5).max(4000),
  }),
  z.object({
    command: z.literal("disputa.resolver"),
    dispute_id: z.string().min(1),
    resolution: z.enum([
      "LIBERAR_REPASSE_INTEGRAL",
      "REEMBOLSO_INTEGRAL",
      "REEMBOLSO_PARCIAL",
    ]),
    refund_amount_cents: z.number().int().positive().optional(),
    resolved_by: z.string().min(1),
    notes: z.string().max(2000).optional(),
  }),
  z.object({ command: z.literal("repasse.processar"), payout_id: z.string().min(1) }),
  z.object({
    command: z.literal("repasse.concluir"),
    payout_id: z.string().min(1),
    external_reference: z.string().min(1),
  }),
  z.object({
    command: z.literal("repasse.falhar"),
    payout_id: z.string().min(1),
    reason: z.string().min(1),
  }),
]);

const envelopeSchema = z.object({
  idempotency_key: z.string().min(8).max(128),
  correlation_id: z.string().max(64).optional(),
  execution_id: z.string().max(64).optional(),
});

async function executar(
  comando: z.infer<typeof comandoSchema>,
  correlationId: string,
): Promise<unknown> {
  switch (comando.command) {
    case "proposta.responder": {
      if (comando.action === "CONTRAPROPOSTA") {
        if (!comando.amount_cents) {
          return apiErrorBody("MISSING_AMOUNT", "Contraproposta exige amount_cents");
        }
        const proposta = await createProposal(
          {
            requestId: comando.request_id,
            providerId: comando.provider_id,
            author: comando.actor,
            amountCents: comando.amount_cents,
            message: comando.message,
          },
          correlationId,
        );
        return { proposal_id: proposta.id, version: proposta.version };
      }
      const alvo =
        comando.proposal_id ??
        (
          await prisma.proposal.findFirst({
            where: { requestId: comando.request_id, providerId: comando.provider_id },
            orderBy: { version: "desc" },
            select: { id: true },
          })
        )?.id;
      if (!alvo) return apiErrorBody("PROPOSAL_NOT_FOUND", "Negociação sem propostas");

      if (comando.action === "ACEITAR") {
        const ordem = await acceptProposal(alvo, comando.actor, correlationId);
        return {
          order_id: ordem.id,
          reference: ordem.reference,
          gross_amount_cents: ordem.grossAmountCents,
          status: "AGUARDANDO_PAGAMENTO",
        };
      }
      const recusada = await rejectProposal(alvo, comando.actor, correlationId);
      return { proposal_id: recusada.id, status: "PROPOSTA_RECUSADA" };
    }
    case "pagamento.criar": {
      const pagamento = await createCheckout(
        { orderId: comando.order_id, method: comando.method },
        correlationId,
      );
      return {
        payment_id: pagamento.id,
        status: pagamento.status,
        pix_copy_paste: pagamento.pixCopyPaste,
        pix_expires_at: pagamento.pixExpiresAt,
      };
    }
    case "ordem.agendar": {
      const ag = await scheduleService(comando.order_id, comando.scheduled_at, correlationId);
      return { appointment_id: ag.id, status: "SERVICO_LIBERADO" };
    }
    case "ordem.iniciar":
      // A jornada agora é em etapas: a caminho → em andamento. O START exige
      // A_CAMINHO (máquina de estado), então o comando primeiro marca o
      // deslocamento e depois inicia.
      await markProviderEnRoute(comando.order_id, comando.eta_minutes, correlationId);
      await startService(comando.order_id, correlationId);
      return { status: "SERVICO_EM_ANDAMENTO" };
    case "ordem.solicitar_conclusao":
      await requestServiceCompletion(comando.order_id, correlationId);
      return { status: "AGUARDANDO_CONFIRMACAO_CONCLUSAO" };
    case "ordem.confirmar_conclusao":
      await confirmServiceCompletion(comando.order_id, correlationId);
      return { status: "SERVICO_CONCLUIDO" };
    case "disputa.abrir": {
      const disputa = await openDispute(
        { orderId: comando.order_id, reason: comando.reason, description: comando.description },
        correlationId,
      );
      return { dispute_id: disputa.id, status: "DISPUTA_ABERTA" };
    }
    case "disputa.resolver": {
      const resolvida = await resolveDispute(
        {
          disputeId: comando.dispute_id,
          resolution: comando.resolution,
          refundAmountCents: comando.refund_amount_cents,
          resolvedBy: comando.resolved_by,
          resolutionNotes: comando.notes,
        },
        correlationId,
      );
      return { dispute_id: resolvida.id, status: resolvida.status };
    }
    case "repasse.processar":
      await processPayout(comando.payout_id, correlationId);
      return { status: "REPASSE_PROCESSANDO" };
    case "repasse.concluir":
      await completePayout(comando.payout_id, comando.external_reference, correlationId);
      return { status: "REPASSE_REALIZADO" };
    case "repasse.falhar":
      await failPayout(comando.payout_id, comando.reason, correlationId);
      return { status: "FAILED" };
  }
}

function apiErrorBody(code: string, message: string) {
  return { error: { code, message } };
}

export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return apiError(400, "INVALID_BODY", "Corpo ilegível");
  }

  try {
    await verifyInboundRequest(rawBody, request.headers);
  } catch (error) {
    if (error instanceof WebhookAuthError) {
      logger.warn("Comando n8n recusado na autenticação", {
        correlationId,
        reason: error.message,
      });
      return apiError(401, "WEBHOOK_AUTH_FAILED", error.message);
    }
    throw error;
  }

  try {
    const json = JSON.parse(rawBody);
    const meta = envelopeSchema.parse(json);
    const comando = comandoSchema.parse(json);
    const cid = meta.correlation_id ?? correlationId;

    // Idempotência de comando: repetição devolve a resposta original sem
    // reexecutar nada (os serviços têm a própria camada, esta é a primeira).
    const existente = await prisma.idempotencyKey.findUnique({
      where: { key: `n8n-cmd:${meta.idempotency_key}` },
    });
    if (existente?.responseBody) {
      return NextResponse.json(existente.responseBody, {
        status: existente.responseStatus ?? 200,
        headers: { "x-idempotent-replay": "true", "x-correlation-id": cid },
      });
    }

    const resultado = await executar(comando, cid);
    const corpo = { ok: true, correlation_id: cid, result: resultado };

    await prisma.idempotencyKey.upsert({
      where: { key: `n8n-cmd:${meta.idempotency_key}` },
      update: {},
      create: {
        key: `n8n-cmd:${meta.idempotency_key}`,
        scope: "n8n-command",
        requestHash: comando.command,
        responseStatus: 200,
        responseBody: corpo as unknown as Prisma.InputJsonValue,
        locked: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
      },
    });

    return NextResponse.json(corpo, { headers: { "x-correlation-id": cid } });
  } catch (error) {
    return handleApiError(error, correlationId);
  }
}
