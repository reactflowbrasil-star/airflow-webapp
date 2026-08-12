/**
 * Solicitação de serviço (§12) e avaliação (§36).
 */

import { DomainError } from "@/domain/shared/errors";
import { serviceRequestMachine } from "@/domain/state-machines";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";
import { registrarEvento } from "@/server/services/analytics-service";

export interface CreateServiceRequestInput {
  customerId: string;
  categoryId: string;
  addressId: string;
  equipmentType:
    | "SPLIT"
    | "INVERTER"
    | "JANELA"
    | "CASSETE"
    | "PISO_TETO"
    | "MULTI_SPLIT"
    | "OUTRO";
  quantity: number;
  btus?: number;
  brand?: string;
  propertyType?: "RESIDENCIAL" | "COMERCIAL";
  description: string;
  urgency?: "BAIXA" | "NORMAL" | "ALTA" | "EMERGENCIA";
  desiredDate?: Date;
  /** Quanto o cliente pretende pagar, em centavos (§12). */
  proposedPriceCents: number;
  searchQuery?: string;
  attachments?: { fileUrl: string; mimeType: string; sizeBytes: number }[];
}

export async function createServiceRequest(
  input: CreateServiceRequestInput,
  correlationId: string,
) {
  if (input.proposedPriceCents <= 0) {
    throw new DomainError("REQUEST_INVALID_PRICE", "Valor proposto deve ser positivo");
  }
  if (input.quantity < 1) {
    throw new DomainError("REQUEST_INVALID_QUANTITY", "Quantidade deve ser ao menos 1");
  }

  // O endereço tem de pertencer a quem está solicitando.
  const address = await prisma.address.findUniqueOrThrow({
    where: { id: input.addressId },
    include: { user: { include: { customerProfile: true } } },
  });
  if (address.user.customerProfile?.id !== input.customerId) {
    throw new DomainError("ADDRESS_NOT_OWNED", "Endereço não pertence ao cliente");
  }

  const request = await prisma.serviceRequest.create({
    data: {
      customerId: input.customerId,
      categoryId: input.categoryId,
      addressId: input.addressId,
      status: "ABERTA",
      equipmentType: input.equipmentType,
      quantity: input.quantity,
      btus: input.btus,
      brand: input.brand,
      propertyType: input.propertyType ?? "RESIDENCIAL",
      description: input.description,
      urgency: input.urgency ?? "NORMAL",
      desiredDate: input.desiredDate,
      proposedPriceCents: input.proposedPriceCents,
      searchQuery: input.searchQuery,
      attachments: input.attachments
        ? { create: input.attachments.map((a, i) => ({ ...a, position: i })) }
        : undefined,
    },
  });

  // Marco do funil (§60): a primeira conversão do cliente para o ciclo comercial.
  await registrarEvento(prisma, {
    nome: "iniciou_solicitacao",
    propriedades: {
      requestId: request.id,
      categoryId: input.categoryId,
      urgency: input.urgency ?? "NORMAL",
      proposedPriceCents: input.proposedPriceCents,
    },
  });

  logger.info("Solicitação criada", {
    correlationId,
    requestId: request.id,
    categoryId: input.categoryId,
    proposedPriceCents: input.proposedPriceCents,
  });

  return request;
}

export async function cancelServiceRequest(
  requestId: string,
  correlationId: string,
) {
  const request = await prisma.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
  });
  serviceRequestMachine.transition(request.status, "CANCELADA");

  const updated = await prisma.serviceRequest.update({
    where: { id: requestId },
    data: { status: "CANCELADA" },
  });
  logger.info("Solicitação cancelada", { correlationId, requestId });
  return updated;
}

export interface CreateReviewInput {
  orderId: string;
  customerId: string;
  rating: number;
  qualityRating?: number;
  punctualityRating?: number;
  serviceRating?: number;
  priceRating?: number;
  professionalismRating?: number;
  comment?: string;
}

/**
 * Avaliação (§36): só quem contratou e teve o serviço concluído pode avaliar.
 * A unique em `Review.orderId` garante uma avaliação por ordem — no banco,
 * não só na aplicação.
 */
export async function createReview(input: CreateReviewInput, correlationId: string) {
  if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
    throw new DomainError("REVIEW_INVALID_RATING", "Nota deve ser inteiro de 1 a 5");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findUniqueOrThrow({
      where: { id: input.orderId },
    });

    if (order.customerId !== input.customerId) {
      throw new DomainError(
        "REVIEW_NOT_OWNED",
        "Somente o cliente da ordem pode avaliá-la",
      );
    }
    if (order.status !== "CONCLUIDA" && order.status !== "LIQUIDADA") {
      throw new DomainError(
        "REVIEW_SERVICE_NOT_COMPLETED",
        `Ordem em ${order.status}: avaliação exige serviço concluído`,
      );
    }

    const review = await tx.review.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        providerId: order.providerId,
        rating: input.rating,
        qualityRating: input.qualityRating,
        punctualityRating: input.punctualityRating,
        serviceRating: input.serviceRating,
        priceRating: input.priceRating,
        professionalismRating: input.professionalismRating,
        comment: input.comment,
      },
    });

    await recalculateReputation(tx, order.providerId);

    // Marco do funil (§60): última etapa do ciclo — avaliação pós-conclusão.
    await registrarEvento(tx, {
      nome: "avaliou",
      propriedades: { orderId: order.id, rating: input.rating },
    });

    logger.info("Avaliação registrada", {
      correlationId,
      orderId: order.id,
      providerId: order.providerId,
      rating: input.rating,
    });

    return review;
  });
}

/**
 * Reputação (§37): não é média simples de estrelas.
 *
 * Combina nota, volume de serviços concluídos, cancelamentos e disputas.
 * Um técnico com nota 5,0 e um único serviço não supera outro com 4,8 e
 * cinquenta serviços — o fator de confiança cresce com o volume.
 */
async function recalculateReputation(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  providerId: string,
): Promise<void> {
  const reviews = await tx.review.findMany({
    where: { providerId, deletedAt: null },
    select: { rating: true },
  });
  const completed = await tx.marketplaceOrder.count({
    where: { providerId, status: { in: ["CONCLUIDA", "LIQUIDADA"] } },
  });
  const canceled = await tx.marketplaceOrder.count({
    where: { providerId, status: "CANCELADA" },
  });
  const disputes = await tx.dispute.count({ where: { providerId } });

  const ratingCount = reviews.length;
  const ratingAverage =
    ratingCount === 0
      ? 0
      : reviews.reduce((acc, r) => acc + r.rating, 0) / ratingCount;

  const totalOrders = completed + canceled;
  const completionRate = totalOrders === 0 ? 0 : completed / totalOrders;

  // Confiança bayesiana: puxa para a média global (3,5) enquanto há poucas
  // avaliações, evitando que 1 nota 5 valha o mesmo que 50 notas 4,8.
  const PRIOR_WEIGHT = 5;
  const PRIOR_MEAN = 3.5;
  const bayesian =
    (ratingAverage * ratingCount + PRIOR_MEAN * PRIOR_WEIGHT) /
    (ratingCount + PRIOR_WEIGHT);

  const disputePenalty = completed === 0 ? 0 : Math.min(disputes / completed, 1) * 1.5;
  const score = Math.max(0, bayesian * (0.7 + 0.3 * completionRate) - disputePenalty);

  await tx.providerProfile.update({
    where: { id: providerId },
    data: {
      ratingAverage,
      ratingCount,
      completedServices: completed,
      canceledServices: canceled,
      disputeCount: disputes,
      completionRate,
      reputationScore: Number(score.toFixed(4)),
    },
  });
}
