/**
 * Avaliação do atendimento (§36).
 *
 * Uma avaliação por ordem (unique em Review.orderId — impede avaliar sem
 * contratar). Só o cliente que pagou pelo serviço avalia, e só depois da
 * conclusão confirmada. Após gravar, a reputação do prestador é recalculada
 * na mesma transação (média bayesiana do §37).
 */

import { DomainError } from "@/domain/shared/errors";
import { prisma } from "@/server/db/prisma";
import { registrarEvento } from "@/server/services/analytics-service";
import { recalculateReputation } from "@/server/services/request-service";

export interface AvaliacaoInput {
  orderId: string;
  customerId: string;
  rating: number;
  comment?: string;
  qualityRating?: number;
  punctualityRating?: number;
  serviceRating?: number;
  priceRating?: number;
  professionalismRating?: number;
}

const ORDENS_AVALIAVEIS = ["CONCLUIDA", "LIQUIDADA"];

export async function submitReview(input: AvaliacaoInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findFirst({
      where: { id: input.orderId, customerId: input.customerId },
      select: {
        id: true,
        status: true,
        providerId: true,
        reference: true,
      },
    });
    // Posse na própria consulta: ordem alheia é indistinguível de inexistente.
    if (!order) {
      throw new DomainError("ORDER_NOT_FOUND", "Pedido não encontrado");
    }
    if (!ORDENS_AVALIAVEIS.includes(order.status)) {
      throw new DomainError(
        "ORDER_NOT_ELIGIBLE",
        "A avaliação só é possível após a conclusão do serviço",
      );
    }

    const existente = await tx.review.findUnique({
      where: { orderId: order.id },
      select: { id: true },
    });
    if (existente) {
      throw new DomainError(
        "ALREADY_REVIEWED",
        "Este pedido já foi avaliado",
      );
    }

    const review = await tx.review.create({
      data: {
        orderId: order.id,
        customerId: input.customerId,
        providerId: order.providerId,
        rating: input.rating,
        comment: input.comment?.trim() || null,
        qualityRating: input.qualityRating ?? null,
        punctualityRating: input.punctualityRating ?? null,
        serviceRating: input.serviceRating ?? null,
        priceRating: input.priceRating ?? null,
        professionalismRating: input.professionalismRating ?? null,
      },
    });

    await recalculateReputation(tx, order.providerId);

    await registrarEvento(tx, {
      nome: "avaliou",
      propriedades: { orderId: order.id, rating: input.rating },
    });

    return review;
  });
}
