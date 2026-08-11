/**
 * Abstração de PSP (§23).
 *
 * O Financial Core nunca conhece o SDK de um gateway. Trocar de provedor —
 * ou operar dois em paralelo — é implementar esta interface e registrar no
 * factory; nenhuma regra de negócio muda.
 *
 *   FINANCIAL CORE → PAYMENT PROVIDER → GATEWAY
 */

export type PaymentMethod = "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO";

/** Status normalizado: cada PSP tem o seu vocabulário, aqui vira um só. */
export type NormalizedStatus =
  | "PENDING"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "CANCELED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "CHARGEBACK";

export interface CreateChargeInput {
  orderId: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  description: string;
  customer: { id: string; name: string; email: string };
  /** Exigida pelo §27 — repetir a chamada não cria segunda cobrança. */
  idempotencyKey: string;
  /**
   * Token gerado pelo checkout do PSP no browser.
   * NUNCA recebemos número de cartão nem CVV (§24).
   */
  cardToken?: string;
  installments?: number;
}

export interface ChargeResult {
  externalId: string;
  status: NormalizedStatus;
  pixQrCode?: string;
  pixCopyPaste?: string;
  expiresAt?: Date;
  cardBrand?: string;
  cardLast4?: string;
  gatewayFeeCents?: number;
}

export interface ChargeStatus {
  externalId: string;
  status: NormalizedStatus;
  amountCents: number;
  paidAt?: Date;
  gatewayFeeCents?: number;
}

export interface RefundRequest {
  externalChargeId: string;
  amountCents: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  externalRefundId: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
}

/** Evento de webhook já normalizado, independente do formato do PSP. */
export interface NormalizedPaymentEvent {
  externalEventId: string;
  externalChargeId: string;
  eventType: string;
  status: NormalizedStatus;
  amountCents: number;
  /** Timestamp do PSP — usado para descartar evento fora de ordem (§26). */
  occurredAt: Date;
  gatewayFeeCents?: number;
  raw: unknown;
}

export interface PaymentProvider {
  readonly id: string;
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  /** Reconfirmação ativa: o webhook é gatilho, não fonte de verdade (§26). */
  getCharge(externalId: string): Promise<ChargeStatus>;
  refund(input: RefundRequest): Promise<RefundResult>;
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string): NormalizedPaymentEvent;
}

export class PaymentProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
