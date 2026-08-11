import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { prisma } from "@/server/db/prisma";
import { verifyInboundRequest, WebhookAuthError } from "@/server/events";
import { newCorrelationId } from "@/server/observability/logger";

/**
 * Consulta sanitizada de uma negociação para o n8n montar mensagens.
 *
 * NUNCA expõe contato (telefone, e-mail, WhatsApp) de nenhuma das partes —
 * a comunicação é intermediada pelo canal oficial da plataforma. O endereço
 * completo só aparece depois do pagamento confirmado (serviço autorizado);
 * antes disso, apenas bairro/cidade.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    await verifyInboundRequest("", request.headers);
  } catch (error) {
    if (error instanceof WebhookAuthError) {
      return apiError(401, "WEBHOOK_AUTH_FAILED", error.message);
    }
    throw error;
  }

  const { id } = await ctx.params;
  const providerId = new URL(request.url).searchParams.get("provider_id") ?? undefined;

  const solicitacao = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      category: { select: { name: true, slug: true } },
      address: true,
      customer: { include: { user: { select: { name: true } } } },
      proposals: {
        where: providerId ? { providerId } : undefined,
        orderBy: { version: "asc" },
        include: { provider: { select: { displayName: true } } },
      },
      order: {
        select: {
          id: true,
          reference: true,
          status: true,
          grossAmountCents: true,
          providerNetAmountCents: true,
        },
      },
    },
  });
  if (!solicitacao) return apiError(404, "NOT_FOUND", "Negociação não encontrada");

  const pagamentoConfirmado =
    solicitacao.order !== null &&
    ["AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA"].includes(
      solicitacao.order.status,
    );

  return NextResponse.json(
    {
      negotiation_id: solicitacao.id,
      status: solicitacao.status,
      service: solicitacao.category.name,
      description: solicitacao.description,
      equipment: `${solicitacao.quantity}x ${solicitacao.equipmentType}`,
      urgency: solicitacao.urgency,
      desired_date: solicitacao.desiredDate,
      customer_first_name: solicitacao.customer.user.name.split(" ")[0],
      location: {
        neighborhood: solicitacao.address.neighborhood,
        city: solicitacao.address.cityName,
        state: solicitacao.address.state,
        // Endereço exato apenas com serviço autorizado (pagamento confirmado)
        street: pagamentoConfirmado ? solicitacao.address.street : undefined,
        number: pagamentoConfirmado ? solicitacao.address.number : undefined,
        complement: pagamentoConfirmado
          ? (solicitacao.address.complement ?? undefined)
          : undefined,
      },
      proposals: solicitacao.proposals.map((p) => ({
        proposal_id: p.id,
        provider_id: p.providerId,
        provider_name: p.provider.displayName,
        author: p.author,
        amount_cents: p.amountCents,
        status: p.status,
        version: p.version,
        created_at: p.createdAt.toISOString(),
      })),
      order: solicitacao.order,
    },
    { headers: { "x-correlation-id": correlationId } },
  );
}
