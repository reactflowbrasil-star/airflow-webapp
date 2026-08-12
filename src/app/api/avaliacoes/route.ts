import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireCustomer } from "@/server/auth/rbac";
import { submitReview } from "@/server/services/review-service";

/**
 * Avaliação do atendimento (§36). O cliente avalia depois da conclusão; a
 * posse é verificada no serviço (ordem alheia responde 404) e a unicidade
 * (uma avaliação por pedido) é garantida pela unique do schema.
 */

const nota = z.number().int().min(1).max(5);

const bodySchema = z.object({
  orderId: z.string().min(1),
  rating: nota,
  comment: z.string().trim().max(500).optional(),
  qualityRating: nota.optional(),
  punctualityRating: nota.optional(),
  serviceRating: nota.optional(),
  priceRating: nota.optional(),
  professionalismRating: nota.optional(),
});

export const POST = withApiHandler<[Request]>(async (_ctx, request) => {
  const session = await requireCustomer();
  const body = await parseJsonBody(request, bodySchema);

  const review = await submitReview({ ...body, customerId: session.customerProfileId });

  return NextResponse.json(
    { review: { id: review.id, rating: review.rating } },
    { status: 201 },
  );
});
