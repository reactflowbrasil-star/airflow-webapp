import { NextResponse } from "next/server";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { checkoutSchema } from "@/lib/validation/marketplace";
import { assertOwnership, requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { createCheckout } from "@/server/services/payment-service";

/**
 * Inicia o pagamento. O valor NUNCA vem do corpo da requisição — é lido da
 * ordem no servidor. Confiar no cliente para informar quanto pagar seria
 * entregar o preço ao comprador.
 */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireCustomer();
  const input = await parseJsonBody(request, checkoutSchema);

  const order = await prisma.marketplaceOrder.findUniqueOrThrow({
    where: { id: input.orderId },
    select: { customerId: true },
  });
  assertOwnership(order.customerId, session.customerProfileId, "pedido");

  const payment = await createCheckout(
    {
      orderId: input.orderId,
      method: input.method,
      cardToken: input.cardToken,
      installments: input.installments,
    },
    correlationId,
  );

  // Devolve só o necessário para renderizar o checkout.
  return NextResponse.json(
    {
      payment: {
        id: payment.id,
        status: payment.status,
        method: payment.method,
        amountCents: payment.amountCents,
        pixQrCode: payment.pixQrCode,
        pixCopyPaste: payment.pixCopyPaste,
        pixExpiresAt: payment.pixExpiresAt,
      },
    },
    { status: 201 },
  );
});
