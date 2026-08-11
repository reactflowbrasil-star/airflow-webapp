import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { requestPayout } from "@/server/services/payout-service";

const schema = z.object({
  amountCents: z.number().int().positive(),
  destinationType: z.enum(["PIX", "BANK_ACCOUNT"]),
  destinationKey: z.string().min(3).max(140),
  destinationName: z.string().max(140).optional(),
});

/**
 * Pedido de repasse do prestador. O providerId vem SEMPRE da sessão —
 * aceitar do corpo permitiria sacar o saldo alheio.
 */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireProvider();
  const input = await parseJsonBody(request, schema);

  const payout = await requestPayout(
    { ...input, providerId: session.providerProfileId },
    correlationId,
  );

  return NextResponse.json(
    {
      payout: {
        id: payout.id,
        status: payout.status,
        amountCents: payout.amountCents,
        requestedAt: payout.requestedAt,
      },
    },
    { status: 201 },
  );
});
