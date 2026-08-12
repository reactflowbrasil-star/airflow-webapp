/**
 * Checkout e processamento de webhook (§24, §25, §26, §27).
 *
 * O cliente nunca confirma o próprio pagamento. A confirmação vem do PSP,
 * passa por validação de assinatura, registro idempotente do evento e
 * reconfirmação ativa antes de qualquer crédito no ledger.
 */

import { DomainError } from "@/domain/shared/errors";
import { paymentCapturedTransaction } from "@/domain/financial/ledger";
import { orderMachine, paymentMachine, type PaymentState } from "@/domain/state-machines";
import { prisma } from "@/server/db/prisma";
import { emitEvent } from "@/server/events";
import { registrarEvento } from "@/server/services/analytics-service";
import { recordOrderEvent } from "@/server/services/message-service";
import { postTransaction } from "@/server/ledger/repository";
import { logger } from "@/server/observability/logger";
import {
  getPaymentProvider,
  type NormalizedStatus,
  type PaymentMethod,
} from "@/server/payments";

export interface CreateCheckoutInput {
  orderId: string;
  method: PaymentMethod;
  cardToken?: string;
  installments?: number;
}

/**
 * Cria a cobrança no PSP para uma ordem.
 *
 * A idempotencyKey deriva da ordem: clicar duas vezes em "pagar" não gera
 * duas cobranças. O valor vem SEMPRE da ordem — nunca de entrada do cliente.
 */
export async function createCheckout(
  input: CreateCheckoutInput,
  correlationId: string,
) {
  const order = await prisma.marketplaceOrder.findUniqueOrThrow({
    where: { id: input.orderId },
    include: { customer: { include: { user: true } } },
  });

  if (order.status !== "AGUARDANDO_PAGAMENTO") {
    throw new DomainError(
      "ORDER_NOT_PAYABLE",
      `Ordem em ${order.status} não está aguardando pagamento`,
    );
  }

  const existing = await prisma.payment.findFirst({
    where: { orderId: order.id, status: { in: ["CREATED", "PENDING", "PROCESSING", "PAID"] } },
  });
  if (existing) {
    logger.info("Checkout já iniciado para a ordem — reaproveitando", {
      correlationId,
      orderId: order.id,
      paymentId: existing.id,
    });
    return existing;
  }

  const provider = getPaymentProvider();
  const idempotencyKey = `checkout:${order.id}:${input.method}`;

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      status: "CREATED",
      method: input.method,
      amountCents: order.grossAmountCents,
      currency: order.currency,
      provider: provider.id,
      idempotencyKey,
      installments: input.installments,
    },
  });

  const startedAt = Date.now();
  try {
    const charge = await provider.createCharge({
      orderId: order.id,
      amountCents: order.grossAmountCents,
      currency: order.currency,
      method: input.method,
      description: `Serviço de climatização — ordem ${order.reference}`,
      customer: {
        id: order.customerId,
        name: order.customer.user.name,
        email: order.customer.user.email,
      },
      idempotencyKey,
      cardToken: input.cardToken,
      installments: input.installments,
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: mapStatus(charge.status),
        externalId: charge.externalId,
        externalStatus: charge.status,
        pixQrCode: charge.pixQrCode,
        pixCopyPaste: charge.pixCopyPaste,
        pixExpiresAt: charge.expiresAt,
        cardBrand: charge.cardBrand,
        cardLast4: charge.cardLast4,
        attempts: {
          create: {
            attemptNumber: 1,
            status: mapStatus(charge.status),
            responsePayload: { externalId: charge.externalId, status: charge.status },
            latencyMs: Date.now() - startedAt,
          },
        },
      },
    });

    await emitEvent(prisma, {
      type: "payment.created",
      idempotencyKey: `payment.created:${payment.id}`,
      correlationId,
      data: {
        order_id: order.id,
        payment_id: payment.id,
        method: input.method,
        amount_cents: order.grossAmountCents,
        provider: provider.id,
        external_id: charge.externalId,
      },
    });

    // Marco do funil (§60): o cliente entrou no checkout.
    await registrarEvento(prisma, {
      nome: "iniciou_checkout",
      propriedades: {
        orderId: order.id,
        paymentId: updated.id,
        method: input.method,
        amountCents: order.grossAmountCents,
      },
    });

    logger.info("Cobrança criada no PSP", {
      correlationId,
      orderId: order.id,
      paymentId: updated.id,
      provider: provider.id,
      externalId: charge.externalId,
    });

    return updated;
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: error instanceof Error ? error.message : String(error),
        attempts: {
          create: {
            attemptNumber: 1,
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : String(error),
            latencyMs: Date.now() - startedAt,
          },
        },
      },
    });
    throw error;
  }
}

function mapStatus(status: NormalizedStatus): PaymentState {
  return status as PaymentState;
}

export interface WebhookResult {
  /** false quando o evento já havia sido processado (§27). */
  processed: boolean;
  reason?: string;
  paymentId?: string;
}

/**
 * Pipeline de webhook (§26).
 *
 *   assinatura → registro idempotente → reconfirmação ativa → ledger → ordem
 *
 * Nunca confia cegamente no corpo recebido: antes de creditar, consulta o PSP
 * e confere status e valor. Um webhook forjado com assinatura válida mas
 * conteúdo divergente não move dinheiro.
 */
export async function processWebhook(
  providerId: string,
  rawBody: string,
  headers: Headers,
  correlationId: string,
): Promise<WebhookResult> {
  const provider = getPaymentProvider(providerId);

  if (!provider.verifyWebhookSignature(rawBody, headers)) {
    logger.warn("Webhook com assinatura inválida — descartado", {
      correlationId,
      provider: providerId,
    });
    throw new DomainError("INVALID_WEBHOOK_SIGNATURE", "Assinatura do webhook inválida");
  }

  const event = provider.parseWebhook(rawBody);

  // Registro do evento cru. A unique constraint é a barreira de idempotência.
  try {
    await prisma.paymentEvent.create({
      data: {
        provider: providerId,
        externalEventId: event.externalEventId,
        eventType: event.eventType,
        rawPayload: JSON.parse(rawBody),
        signature: headers.get("x-sandbox-signature"),
        signatureValid: true,
        occurredAt: event.occurredAt,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      logger.info("Webhook repetido — nenhum efeito adicional", {
        correlationId,
        externalEventId: event.externalEventId,
      });
      return { processed: false, reason: "DUPLICATE_EVENT" };
    }
    throw error;
  }

  const payment = await prisma.payment.findFirst({
    where: { provider: providerId, externalId: event.externalChargeId },
  });
  if (!payment) {
    logger.warn("Webhook para cobrança desconhecida", {
      correlationId,
      externalChargeId: event.externalChargeId,
    });
    return { processed: false, reason: "UNKNOWN_CHARGE" };
  }

  // Evento fora de ordem: um antigo não regride um pagamento já confirmado.
  const lastProcessed = await prisma.paymentEvent.findFirst({
    where: { paymentId: payment.id, processed: true },
    orderBy: { occurredAt: "desc" },
  });
  if (
    lastProcessed?.occurredAt &&
    event.occurredAt.getTime() < lastProcessed.occurredAt.getTime()
  ) {
    logger.warn("Webhook fora de ordem — ignorado", {
      correlationId,
      paymentId: payment.id,
      eventAt: event.occurredAt.toISOString(),
      lastProcessedAt: lastProcessed.occurredAt.toISOString(),
    });
    await markEventProcessed(event.externalEventId, payment.id, "OUT_OF_ORDER");
    return { processed: false, reason: "OUT_OF_ORDER", paymentId: payment.id };
  }

  // Reconfirmação ativa: o webhook é gatilho, a verdade vem da consulta.
  const confirmed = await provider.getCharge(event.externalChargeId);
  if (confirmed.status !== event.status) {
    logger.warn("Divergência entre webhook e consulta ao PSP — usando a consulta", {
      correlationId,
      paymentId: payment.id,
      webhookStatus: event.status,
      confirmedStatus: confirmed.status,
    });
  }
  if (confirmed.amountCents !== payment.amountCents) {
    logger.error("Valor do PSP diverge do valor da cobrança — nada será creditado", {
      correlationId,
      paymentId: payment.id,
      expected: payment.amountCents,
      received: confirmed.amountCents,
    });
    await markEventProcessed(event.externalEventId, payment.id, "AMOUNT_MISMATCH");
    return { processed: false, reason: "AMOUNT_MISMATCH", paymentId: payment.id };
  }

  const targetStatus = mapStatus(confirmed.status);
  if (payment.status === targetStatus) {
    await markEventProcessed(event.externalEventId, payment.id);
    return { processed: false, reason: "ALREADY_IN_STATE", paymentId: payment.id };
  }
  if (!paymentMachine.canTransition(payment.status, targetStatus)) {
    logger.warn("Transição de pagamento recusada pela máquina de estado", {
      correlationId,
      paymentId: payment.id,
      from: payment.status,
      to: targetStatus,
    });
    await markEventProcessed(event.externalEventId, payment.id, "INVALID_TRANSITION");
    return { processed: false, reason: "INVALID_TRANSITION", paymentId: payment.id };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: targetStatus,
        externalStatus: confirmed.status,
        gatewayFeeCents: confirmed.gatewayFeeCents ?? 0,
        paidAt: targetStatus === "PAID" ? (confirmed.paidAt ?? new Date()) : undefined,
        failedAt: targetStatus === "FAILED" ? new Date() : undefined,
        expiredAt: targetStatus === "EXPIRED" ? new Date() : undefined,
      },
    });

    if (targetStatus === "PAID") {
      // Dinheiro entra no caixa e fica retido em escrow até a conclusão (§17)
      await postTransaction(
        tx,
        paymentCapturedTransaction({
          orderId: payment.orderId,
          paymentId: payment.id,
          amountCents: payment.amountCents,
          currency: "BRL",
          correlationId,
          externalReference: event.externalChargeId,
        }),
      );

      const order = await tx.marketplaceOrder.findUniqueOrThrow({
        where: { id: payment.orderId },
      });
      orderMachine.transition(order.status, "PAGA");
      await tx.marketplaceOrder.update({
        where: { id: order.id },
        data: { status: "PAGA" },
      });

      await tx.auditLog.create({
        data: {
          action: "PAYMENT_CONFIRMED",
          entityType: "Payment",
          entityId: payment.id,
          newValue: { status: "PAID", amountCents: payment.amountCents },
          correlationId,
        },
      });

      await recordOrderEvent(tx, order, {
        type: "PAYMENT",
        content: `Pagamento de ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(
          payment.amountCents / 100,
        )} confirmado e retido pela plataforma. O técnico já pode agendar o atendimento.`,
        metadata: { orderId: order.id, amountCents: payment.amountCents },
      });

      await emitEvent(tx, {
        type: "payment.confirmed",
        idempotencyKey: `payment.confirmed:${payment.id}`,
        correlationId,
        data: {
          order_id: payment.orderId,
          payment_id: payment.id,
          amount_cents: payment.amountCents,
          status: "PAGAMENTO_CONFIRMADO",
        },
      });

      // Marco do funil (§60): dinheiro efetivamente confirmado pelo PSP.
      await registrarEvento(tx, {
        nome: "pagamento_aprovado",
        propriedades: {
          orderId: payment.orderId,
          paymentId: payment.id,
          amountCents: payment.amountCents,
        },
      });
    } else if (targetStatus === "FAILED" || targetStatus === "EXPIRED") {
      await emitEvent(tx, {
        type: "payment.failed",
        idempotencyKey: `payment.failed:${payment.id}:${event.externalEventId}`,
        correlationId,
        data: {
          order_id: payment.orderId,
          payment_id: payment.id,
          reason: targetStatus,
        },
      });
    }

    await tx.paymentEvent.update({
      where: {
        provider_externalEventId: {
          provider: providerId,
          externalEventId: event.externalEventId,
        },
      },
      data: { paymentId: payment.id, processed: true, processedAt: new Date() },
    });
  });

  logger.info("Webhook processado", {
    correlationId,
    paymentId: payment.id,
    status: targetStatus,
  });

  return { processed: true, paymentId: payment.id };
}

async function markEventProcessed(
  externalEventId: string,
  paymentId: string,
  error?: string,
): Promise<void> {
  await prisma.paymentEvent.updateMany({
    where: { externalEventId },
    data: { paymentId, processed: true, processedAt: new Date(), processingError: error },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}
