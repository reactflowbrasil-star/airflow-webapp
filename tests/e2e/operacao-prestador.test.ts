import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { runProviderOrderAction } from "@/server/services/execution-service";
import { createCheckout, processWebhook } from "@/server/services/payment-service";
import { acceptProposal, createProposal } from "@/server/services/proposal-service";
import { createServiceRequest } from "@/server/services/request-service";
import {
  criarCenarioBase,
  resetDatabase,
  sandbox,
  webhookHeaders,
  type Cenario,
} from "./helpers";

const CID = "test-operacao-prestador";
let cenario: Cenario;

beforeEach(async () => {
  await resetDatabase();
  cenario = await criarCenarioBase();
});

afterAll(async () => prisma.$disconnect());

async function criarOrdemPaga() {
  const request = await createServiceRequest(
    {
      customerId: cenario.customerProfileId,
      categoryId: cenario.categoryId,
      addressId: cenario.addressId,
      equipmentType: "SPLIT",
      quantity: 1,
      description: "Higienização completa do aparelho",
      proposedPriceCents: 18000,
    },
    CID,
  );
  const proposal = await createProposal(
    {
      requestId: request.id,
      providerId: cenario.providerProfileId,
      author: "PRESTADOR",
      amountCents: 18000,
    },
    CID,
  );
  const order = await acceptProposal(proposal.id, "CLIENTE", CID);
  const payment = await createCheckout({ orderId: order.id, method: "PIX" }, CID);
  const event = sandbox().simulateSettlement(payment.externalId!);
  await processWebhook("sandbox", event.body, webhookHeaders(event.signature), CID);
  return order;
}

describe("operação do serviço pelo prestador", () => {
  it("agenda, inicia e solicita conclusão da própria ordem", async () => {
    const order = await criarOrdemPaga();
    await runProviderOrderAction(order.id, cenario.providerProfileId, {
      type: "SCHEDULE",
      scheduledAt: new Date("2026-09-20T14:00:00Z"),
    }, CID);
    await runProviderOrderAction(order.id, cenario.providerProfileId, { type: "START" }, CID);
    await runProviderOrderAction(
      order.id,
      cenario.providerProfileId,
      { type: "REQUEST_COMPLETION" },
      CID,
    );

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(appointment.status).toBe("CONCLUIDO");
    expect(appointment.startedAt).not.toBeNull();
    expect(appointment.completedAt).not.toBeNull();
  });

  it("trata ordem de outro prestador como inexistente", async () => {
    const order = await criarOrdemPaga();
    const result = await runProviderOrderAction(
      order.id,
      "provider-alheio",
      { type: "START" },
      CID,
    );
    expect(result).toBeNull();
    expect(await prisma.appointment.count()).toBe(0);
  });
});
