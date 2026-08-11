/**
 * As 10 máquinas de estado do sistema (§52), com os mesmos literais dos
 * enums do Prisma — o typecheck quebra se os dois lados divergirem.
 */

import { defineStateMachine } from "./machine";

// ---------------------------------------------------------------------------
// PRESTADOR (§8)
// ---------------------------------------------------------------------------
export type ProviderState =
  | "INCOMPLETO"
  | "AGUARDANDO_ANALISE"
  | "APROVADO"
  | "REJEITADO"
  | "SUSPENSO"
  | "BLOQUEADO";

export const providerMachine = defineStateMachine<ProviderState>("Provider", {
  INCOMPLETO: ["AGUARDANDO_ANALISE"],
  AGUARDANDO_ANALISE: ["APROVADO", "REJEITADO", "INCOMPLETO"],
  APROVADO: ["SUSPENSO", "BLOQUEADO"],
  REJEITADO: ["INCOMPLETO"],
  SUSPENSO: ["APROVADO", "BLOQUEADO"],
  BLOQUEADO: [],
});

// ---------------------------------------------------------------------------
// SOLICITAÇÃO
// ---------------------------------------------------------------------------
export type ServiceRequestState =
  | "RASCUNHO"
  | "ABERTA"
  | "EM_NEGOCIACAO"
  | "CONTRATADA"
  | "CANCELADA"
  | "EXPIRADA";

export const serviceRequestMachine = defineStateMachine<ServiceRequestState>(
  "ServiceRequest",
  {
    RASCUNHO: ["ABERTA", "CANCELADA"],
    ABERTA: ["EM_NEGOCIACAO", "CANCELADA", "EXPIRADA"],
    EM_NEGOCIACAO: ["CONTRATADA", "ABERTA", "CANCELADA", "EXPIRADA"],
    CONTRATADA: [],
    CANCELADA: [],
    EXPIRADA: [],
  },
);

// ---------------------------------------------------------------------------
// PROPOSTA (§14)
// ---------------------------------------------------------------------------
export type ProposalState =
  | "ENVIADA"
  | "CONTRAPROPOSTA"
  | "ACEITA"
  | "RECUSADA"
  | "EXPIRADA"
  | "RETIRADA";

export const proposalMachine = defineStateMachine<ProposalState>("Proposal", {
  ENVIADA: ["ACEITA", "RECUSADA", "CONTRAPROPOSTA", "EXPIRADA", "RETIRADA"],
  CONTRAPROPOSTA: ["ACEITA", "RECUSADA", "EXPIRADA", "RETIRADA"],
  ACEITA: [],
  RECUSADA: [],
  EXPIRADA: [],
  RETIRADA: [],
});

// ---------------------------------------------------------------------------
// ORDER (§52) — após aceite, valor só muda por fluxo formal (§14)
// ---------------------------------------------------------------------------
export type OrderState =
  | "CRIADA"
  | "AGUARDANDO_PAGAMENTO"
  | "PAGA"
  | "AUTORIZADA"
  | "EM_EXECUCAO"
  | "CONCLUIDA"
  | "LIQUIDADA"
  | "CANCELADA"
  | "EM_DISPUTA"
  | "ESTORNADA";

export const orderMachine = defineStateMachine<OrderState>("Order", {
  CRIADA: ["AGUARDANDO_PAGAMENTO", "CANCELADA"],
  AGUARDANDO_PAGAMENTO: ["PAGA", "CANCELADA"],
  PAGA: ["AUTORIZADA", "ESTORNADA", "EM_DISPUTA"],
  AUTORIZADA: ["EM_EXECUCAO", "CANCELADA", "EM_DISPUTA"],
  EM_EXECUCAO: ["CONCLUIDA", "EM_DISPUTA"],
  CONCLUIDA: ["LIQUIDADA", "EM_DISPUTA"],
  LIQUIDADA: ["EM_DISPUTA"],
  CANCELADA: [],
  EM_DISPUTA: ["AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA", "ESTORNADA", "CANCELADA"],
  ESTORNADA: [],
});

// ---------------------------------------------------------------------------
// PAYMENT (§25)
// ---------------------------------------------------------------------------
export type PaymentState =
  | "CREATED"
  | "PENDING"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "CANCELED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "CHARGEBACK";

export const paymentMachine = defineStateMachine<PaymentState>("Payment", {
  CREATED: ["PENDING", "CANCELED", "FAILED"],
  PENDING: ["PROCESSING", "PAID", "EXPIRED", "CANCELED", "FAILED"],
  PROCESSING: ["PAID", "FAILED"],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED", "CHARGEBACK"],
  FAILED: ["PENDING"],
  EXPIRED: ["PENDING"],
  CANCELED: [],
  PARTIALLY_REFUNDED: ["REFUNDED", "CHARGEBACK"],
  REFUNDED: [],
  CHARGEBACK: [],
});

// ---------------------------------------------------------------------------
// APPOINTMENT (§34)
// ---------------------------------------------------------------------------
export type AppointmentState =
  | "AGUARDANDO"
  | "CONFIRMADO"
  | "A_CAMINHO"
  | "EM_ANDAMENTO"
  | "CONCLUIDO"
  | "CANCELADO"
  | "EM_DISPUTA";

export const appointmentMachine = defineStateMachine<AppointmentState>("Appointment", {
  AGUARDANDO: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["A_CAMINHO", "CANCELADO"],
  A_CAMINHO: ["EM_ANDAMENTO", "CANCELADO"],
  EM_ANDAMENTO: ["CONCLUIDO", "EM_DISPUTA"],
  CONCLUIDO: ["EM_DISPUTA"],
  CANCELADO: [],
  EM_DISPUTA: ["CONCLUIDO", "CANCELADO"],
});

// ---------------------------------------------------------------------------
// DISPUTE (§33)
// ---------------------------------------------------------------------------
export type DisputeState =
  | "ABERTA"
  | "EM_ANALISE"
  | "AGUARDANDO_EVIDENCIA"
  | "RESOLVIDA_CLIENTE"
  | "RESOLVIDA_PRESTADOR"
  | "RESOLVIDA_PARCIAL"
  | "CANCELADA";

export const disputeMachine = defineStateMachine<DisputeState>("Dispute", {
  ABERTA: ["EM_ANALISE", "CANCELADA"],
  EM_ANALISE: [
    "AGUARDANDO_EVIDENCIA",
    "RESOLVIDA_CLIENTE",
    "RESOLVIDA_PRESTADOR",
    "RESOLVIDA_PARCIAL",
    "CANCELADA",
  ],
  AGUARDANDO_EVIDENCIA: ["EM_ANALISE", "CANCELADA"],
  RESOLVIDA_CLIENTE: [],
  RESOLVIDA_PRESTADOR: [],
  RESOLVIDA_PARCIAL: [],
  CANCELADA: [],
});

// ---------------------------------------------------------------------------
// PAYOUT (§28)
// ---------------------------------------------------------------------------
export type PayoutState = "REQUESTED" | "PROCESSING" | "PAID" | "FAILED" | "CANCELED";

export const payoutMachine = defineStateMachine<PayoutState>("Payout", {
  REQUESTED: ["PROCESSING", "CANCELED"],
  PROCESSING: ["PAID", "FAILED"],
  PAID: [],
  FAILED: ["REQUESTED"],
  CANCELED: [],
});

// ---------------------------------------------------------------------------
// REFUND (§30)
// ---------------------------------------------------------------------------
export type RefundState = "SOLICITADO" | "PROCESSANDO" | "CONCLUIDO" | "FALHOU";

export const refundMachine = defineStateMachine<RefundState>("Refund", {
  SOLICITADO: ["PROCESSANDO"],
  PROCESSANDO: ["CONCLUIDO", "FALHOU"],
  CONCLUIDO: [],
  FALHOU: ["SOLICITADO"],
});

// ---------------------------------------------------------------------------
// NEGOTIATION (§14) — derivada do encadeamento de propostas.
// Regras de quem pode agir em cada momento da negociação.
// ---------------------------------------------------------------------------
export type NegotiationActor = "CLIENTE" | "PRESTADOR";

/** Depois de uma proposta de X, só o outro lado pode aceitar/contrapropor. */
export function nextNegotiationActor(lastAuthor: NegotiationActor): NegotiationActor {
  return lastAuthor === "CLIENTE" ? "PRESTADOR" : "CLIENTE";
}

export { defineStateMachine } from "./machine";
