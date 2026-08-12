import { NextResponse } from "next/server";
import { z } from "zod";

import { redigirContato } from "@/domain/messaging/contact-guard";
import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { recordOrderEvent } from "@/server/services/message-service";

/**
 * Registro fotográfico do serviço (§35) — upload pelo prestador.
 *
 * A foto entra no fio da conversa como mensagem IMAGE (o mesmo thread que a
 * mediação lê depois), com o rótulo como conteúdo. O cliente vê as fotos na
 * página de acompanhamento. Tudo em data URL: o cliente redimensiona para
 * no máximo 1280px antes de enviar; aqui só se valida formato e tamanho
 * (≤ 1 MB decodificado, até 6 fotos por pedido). Sem storage externo.
 */

const bodySchema = z.object({
  rotulo: z.string().trim().max(30).optional(),
  dataUrl: z
    .string()
    .max(1_400_000)
    .refine(
      (value) => /^data:image\/(png|jpeg|jpg|webp);base64,/.test(value),
      "Formato de imagem inválido",
    ),
});

const MAX_BYTES = 1024 * 1024;
const MAX_FOTOS = 6;

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  return Math.ceil((base64.length * 3) / 4);
}

export const POST = withApiHandler<
  [Request, { params: Promise<{ orderId: string }> }]
>(async (_ctx, request, { params }) => {
  const session = await requireProvider();
  const body = await parseJsonBody(request, bodySchema);
  const { orderId } = await params;

  if (dataUrlBytes(body.dataUrl) > MAX_BYTES) {
    return apiError(422, "PHOTO_TOO_LARGE", "Foto muito grande (máx. 1 MB)");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findFirst({
      where: { id: orderId, providerId: session.providerProfileId },
      select: {
        id: true,
        requestId: true,
        customerId: true,
        providerId: true,
        status: true,
      },
    });
    // Posse na própria consulta: ordem alheia responde 404.
    if (!order) return apiError(404, "NOT_FOUND", "Serviço não encontrado");

    if (!["EM_EXECUCAO", "CONCLUIDA"].includes(order.status)) {
      return apiError(
        422,
        "ORDER_NOT_IN_EXECUTION",
        "Fotos podem ser registradas durante ou após a execução do serviço",
      );
    }

    const fotos = await tx.message.count({
      where: {
        type: "IMAGE",
        conversation: {
          requestId: order.requestId,
          customerId: order.customerId,
          providerId: order.providerId,
        },
      },
    });
    if (fotos >= MAX_FOTOS) {
      return apiError(
        422,
        "PHOTO_LIMIT_REACHED",
        `Limite de ${MAX_FOTOS} fotos por serviço`,
      );
    }

    const rotulo = body.rotulo ? redigirContato(body.rotulo).texto : "Foto registrada";

    await recordOrderEvent(tx, order, {
      type: "IMAGE",
      content: rotulo,
      attachmentUrl: body.dataUrl,
      metadata: { orderId, kind: "service_photo" },
    });

    return NextResponse.json({ foto: { rotulo } }, { status: 201 });
  });
});
