/**
 * Adapter de PSP para desenvolvimento e testes.
 *
 * NÃO é um mock de conveniência: implementa a interface real, assina webhooks
 * com HMAC-SHA256 de verdade e devolve estados normalizados. Isso permite
 * exercitar o pipeline completo — assinatura, idempotência, reconfirmação,
 * ledger — antes de existir contrato com um PSP.
 *
 * Em produção, `PAYMENT_PROVIDER` aponta para um adapter real (Mercado Pago,
 * Asaas, Pagar.me, Stripe) que implementa exatamente esta mesma interface.
 *
 * O desfecho de uma cobrança é escolhido explicitamente pelo teste em
 * `simulateSettlement({ outcome })`, e não derivado do valor. Derivar do valor
 * criaria armadilha: R$ 100,00, R$ 200,00 e R$ 300,00 são justamente os
 * valores mais prováveis num teste, e nenhum deles deve significar "falha"
 * por acidente.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PaymentProviderError,
  type ChargeResult,
  type ChargeStatus,
  type CreateChargeInput,
  type NormalizedPaymentEvent,
  type NormalizedStatus,
  type PaymentProvider,
  type RefundRequest,
  type RefundResult,
} from "./provider";

interface StoredCharge {
  externalId: string;
  orderId: string;
  amountCents: number;
  status: NormalizedStatus;
  method: string;
  createdAt: Date;
  paidAt?: Date;
  refundedCents: number;
}

/** Taxa simulada do gateway: 0,99% + R$ 0,40. */
function simulatedFee(amountCents: number): number {
  return Math.round(amountCents * 0.0099) + 40;
}

export class SandboxPaymentProvider implements PaymentProvider {
  readonly id = "sandbox";

  /** Estado em memória — o "banco do PSP" nesta simulação. */
  private readonly charges = new Map<string, StoredCharge>();
  private readonly byIdempotencyKey = new Map<string, string>();
  private eventCounter = 0;

  constructor(private readonly webhookSecret: string) {
    if (!webhookSecret) {
      throw new Error("SANDBOX_WEBHOOK_SECRET não configurado");
    }
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    // Idempotência no lado do PSP: repetir a chamada devolve a mesma cobrança.
    const existingId = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.charges.get(existingId)!;
      return this.toChargeResult(existing);
    }

    if (input.amountCents <= 0) {
      throw new PaymentProviderError(
        "INVALID_AMOUNT",
        `Valor inválido: ${input.amountCents}`,
      );
    }
    if (
      (input.method === "CREDIT_CARD" || input.method === "DEBIT_CARD") &&
      !input.cardToken
    ) {
      throw new PaymentProviderError(
        "MISSING_CARD_TOKEN",
        "Pagamento com cartão exige token do checkout do PSP",
      );
    }

    const externalId = `sbx_ch_${input.orderId}_${this.charges.size + 1}`;
    const charge: StoredCharge = {
      externalId,
      orderId: input.orderId,
      amountCents: input.amountCents,
      status: "PENDING",
      method: input.method,
      createdAt: new Date(),
      refundedCents: 0,
    };
    this.charges.set(externalId, charge);
    this.byIdempotencyKey.set(input.idempotencyKey, externalId);

    return this.toChargeResult(charge);
  }

  async getCharge(externalId: string): Promise<ChargeStatus> {
    const charge = this.charges.get(externalId);
    if (!charge) {
      throw new PaymentProviderError("CHARGE_NOT_FOUND", `Cobrança ${externalId} não existe`);
    }
    return {
      externalId,
      status: charge.status,
      amountCents: charge.amountCents,
      paidAt: charge.paidAt,
      gatewayFeeCents:
        charge.status === "PAID" ? simulatedFee(charge.amountCents) : undefined,
    };
  }

  async refund(input: RefundRequest): Promise<RefundResult> {
    const charge = this.charges.get(input.externalChargeId);
    if (!charge) {
      throw new PaymentProviderError("CHARGE_NOT_FOUND", "Cobrança não encontrada");
    }
    if (charge.status !== "PAID" && charge.status !== "PARTIALLY_REFUNDED") {
      throw new PaymentProviderError(
        "NOT_REFUNDABLE",
        `Cobrança em ${charge.status} não pode ser estornada`,
      );
    }
    const remaining = charge.amountCents - charge.refundedCents;
    if (input.amountCents > remaining) {
      throw new PaymentProviderError(
        "REFUND_EXCEEDS_REMAINING",
        `Estorno de ${input.amountCents} excede o saldo estornável de ${remaining}`,
      );
    }

    charge.refundedCents += input.amountCents;
    charge.status =
      charge.refundedCents === charge.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED";

    return {
      externalRefundId: `sbx_rf_${input.externalChargeId}_${charge.refundedCents}`,
      status: "COMPLETED",
    };
  }

  verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
    const received = headers.get("x-sandbox-signature");
    if (!received) return false;

    const expected = this.sign(rawBody);
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    // Comparação em tempo constante: evita distinguir assinaturas por timing.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: string): NormalizedPaymentEvent {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new PaymentProviderError("INVALID_PAYLOAD", "Webhook não é JSON válido");
    }

    const eventId = payload.event_id;
    const chargeId = payload.charge_id;
    const status = payload.status;
    if (
      typeof eventId !== "string" ||
      typeof chargeId !== "string" ||
      typeof status !== "string"
    ) {
      throw new PaymentProviderError(
        "INVALID_PAYLOAD",
        "Webhook sem event_id, charge_id ou status",
      );
    }

    return {
      externalEventId: eventId,
      externalChargeId: chargeId,
      eventType: String(payload.type ?? "charge.updated"),
      status: status as NormalizedStatus,
      amountCents: Number(payload.amount_cents ?? 0),
      occurredAt: new Date(String(payload.occurred_at ?? new Date().toISOString())),
      gatewayFeeCents:
        payload.gateway_fee_cents === undefined
          ? undefined
          : Number(payload.gateway_fee_cents),
      raw: payload,
    };
  }

  // ---------------------------------------------------------------------
  // Helpers exclusivos da simulação — não fazem parte da interface
  // ---------------------------------------------------------------------

  /** Assina como o PSP assinaria, para o teste exercitar a verificação real. */
  sign(rawBody: string): string {
    return createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
  }

  /**
   * Avança a cobrança para um estado final e devolve o corpo + assinatura do
   * webhook que o PSP enviaria. O desfecho é explícito (default: aprovado).
   */
  simulateSettlement(
    externalId: string,
    options: {
      outcome?: "PAID" | "FAILED" | "EXPIRED";
      occurredAt?: Date;
      eventId?: string;
    } = {},
  ): { body: string; signature: string; status: NormalizedStatus } {
    const charge = this.charges.get(externalId);
    if (!charge) {
      throw new PaymentProviderError("CHARGE_NOT_FOUND", "Cobrança não encontrada");
    }

    const status: NormalizedStatus = options.outcome ?? "PAID";
    charge.status = status;
    if (status === "PAID") charge.paidAt = options.occurredAt ?? new Date();

    this.eventCounter += 1;
    const body = JSON.stringify({
      event_id: options.eventId ?? `sbx_ev_${externalId}_${this.eventCounter}`,
      type: `charge.${status.toLowerCase()}`,
      charge_id: externalId,
      status,
      amount_cents: charge.amountCents,
      gateway_fee_cents: status === "PAID" ? simulatedFee(charge.amountCents) : 0,
      occurred_at: (options.occurredAt ?? new Date()).toISOString(),
    });

    return { body, signature: this.sign(body), status };
  }

  /** Reemite um evento já emitido — usado para testar idempotência (§27). */
  replayEvent(body: string): { body: string; signature: string } {
    return { body, signature: this.sign(body) };
  }

  private toChargeResult(charge: StoredCharge): ChargeResult {
    const isPix = charge.method === "PIX";
    return {
      externalId: charge.externalId,
      status: charge.status,
      pixQrCode: isPix ? `00020126sandbox${charge.externalId}` : undefined,
      pixCopyPaste: isPix
        ? `00020126580014BR.GOV.BCB.PIX0136${charge.externalId}5204000053039865802BR`
        : undefined,
      expiresAt: isPix
        ? new Date(charge.createdAt.getTime() + 30 * 60 * 1000)
        : undefined,
      cardBrand: isPix ? undefined : "visa",
      cardLast4: isPix ? undefined : "4242",
    };
  }
}
