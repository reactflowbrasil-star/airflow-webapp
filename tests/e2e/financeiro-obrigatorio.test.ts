/**
 * Testes financeiros obrigatórios (§64) que exigem banco real.
 *
 * Os cenários de cálculo puro estão em tests/financial. Aqui ficam os que só
 * têm sentido contra o Postgres: idempotência por constraint, concorrência
 * com lock, ordem de webhooks e conciliação.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { createServiceRequest } from "@/server/services/request-service";
import { acceptProposal, createProposal } from "@/server/services/proposal-service";
import { createCheckout, processWebhook } from "@/server/services/payment-service";
import {
  confirmServiceCompletion,
  markProviderEnRoute,
  requestServiceCompletion,
  releaseEligibleBalances,
  scheduleService,
  settleOrder,
  startService,
} from "@/server/services/execution-service";
import {
  completePayout,
  processPayout,
  requestPayout,
  runReconciliation,
} from "@/server/services/payout-service";
import {
  criarCenarioBase,
  resetDatabase,
  sandbox,
  webhookHeaders,
  type Cenario,
} from "./helpers";

const CID = "test-cid";
let cenario: Cenario;

beforeEach(async () => {
  await resetDatabase();
  cenario = await criarCenarioBase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Leva uma ordem até o estado pago, devolvendo ids úteis. */
async function ordemPaga(amountCents = 28000) {
  const request = await createServiceRequest(
    {
      customerId: cenario.customerProfileId,
      categoryId: cenario.categoryId,
      addressId: cenario.addressId,
      equipmentType: "SPLIT",
      quantity: 1,
      description: "Limpeza",
      proposedPriceCents: amountCents,
    },
    CID,
  );
  const proposal = await createProposal(
    {
      requestId: request.id,
      providerId: cenario.providerProfileId,
      author: "CLIENTE",
      amountCents,
    },
    CID,
  );
  const order = await acceptProposal(proposal.id, "PRESTADOR", CID);
  const payment = await createCheckout({ orderId: order.id, method: "PIX" }, CID);
  return { request, order, payment };
}

/** Leva uma ordem até saldo disponível para saque. */
async function ordemComSaldoDisponivel(amountCents = 28000) {
  const { order, payment } = await ordemPaga(amountCents);
  const evento = sandbox().simulateSettlement(payment.externalId!);
  await processWebhook("sandbox", evento.body, webhookHeaders(evento.signature), CID);
  await scheduleService(order.id, new Date("2026-09-01T10:00:00Z"), CID);
  await markProviderEnRoute(order.id, undefined, CID);
  await startService(order.id, CID);
  await requestServiceCompletion(order.id, CID);
  await confirmServiceCompletion(order.id, CID);
  await settleOrder(order.id, CID);
  await releaseEligibleBalances(CID, new Date(Date.now() + 49 * 3_600_000));
  return order;
}

describe("§64 — pagamentos", () => {
  it("pagamento recusado não credita ninguém", async () => {
    const { order, payment } = await ordemPaga();
    const evento = sandbox().simulateSettlement(payment.externalId!, {
      outcome: "FAILED",
    });

    const resultado = await processWebhook(
      "sandbox",
      evento.body,
      webhookHeaders(evento.signature),
      CID,
    );
    expect(resultado.processed).toBe(true);

    const atualizado = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(atualizado.status).toBe("FAILED");
    expect(await prisma.ledgerTransaction.count()).toBe(0);
    expect(
      (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("AGUARDANDO_PAGAMENTO");
  });

  it("PIX expirado deixa a ordem sem pagamento e sem lançamento", async () => {
    const { payment } = await ordemPaga();
    const evento = sandbox().simulateSettlement(payment.externalId!, {
      outcome: "EXPIRED",
    });

    await processWebhook("sandbox", evento.body, webhookHeaders(evento.signature), CID);

    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe("EXPIRED");
    expect(await prisma.ledgerTransaction.count()).toBe(0);
  });

  it("checkout repetido não cria segunda cobrança", async () => {
    const { order } = await ordemPaga();
    const segundo = await createCheckout({ orderId: order.id, method: "PIX" }, CID);

    const pagamentos = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(pagamentos).toHaveLength(1);
    expect(segundo.id).toBe(pagamentos[0].id);
  });
});

describe("§64, §26, §27 — webhooks", () => {
  it("webhook duplicado dez vezes produz um único efeito financeiro", async () => {
    const { payment } = await ordemPaga();
    const evento = sandbox().simulateSettlement(payment.externalId!);

    const primeiro = await processWebhook(
      "sandbox",
      evento.body,
      webhookHeaders(evento.signature),
      CID,
    );
    expect(primeiro.processed).toBe(true);

    for (let i = 0; i < 9; i++) {
      const repetido = sandbox().replayEvent(evento.body);
      const resultado = await processWebhook(
        "sandbox",
        repetido.body,
        webhookHeaders(repetido.signature),
        CID,
      );
      expect(resultado.processed).toBe(false);
      expect(resultado.reason).toBe("DUPLICATE_EVENT");
    }

    // Um único lançamento, um único crédito
    const capturas = await prisma.ledgerTransaction.findMany({
      where: { type: "PAYMENT_CAPTURED" },
    });
    expect(capturas).toHaveLength(1);

    const entries = await prisma.ledgerEntry.findMany({
      where: { account: { code: "CUSTOMER_ESCROW" } },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].amountCents).toBe(28000);
  });

  it("webhook com assinatura inválida é recusado sem efeito", async () => {
    const { payment } = await ordemPaga();
    const evento = sandbox().simulateSettlement(payment.externalId!);

    await expect(
      processWebhook(
        "sandbox",
        evento.body,
        webhookHeaders("assinatura-forjada-invalida"),
        CID,
      ),
    ).rejects.toThrow(/[Aa]ssinatura/);

    expect(await prisma.paymentEvent.count()).toBe(0);
    expect(await prisma.ledgerTransaction.count()).toBe(0);
  });

  it("webhook atrasado não regride um pagamento já confirmado", async () => {
    const { payment } = await ordemPaga();

    const confirmacao = sandbox().simulateSettlement(payment.externalId!, {
      occurredAt: new Date("2026-08-11T12:00:00Z"),
      eventId: "ev-confirmacao",
    });
    await processWebhook(
      "sandbox",
      confirmacao.body,
      webhookHeaders(confirmacao.signature),
      CID,
    );
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe("PAID");

    // Evento MAIS ANTIGO chegando depois — deve ser ignorado
    const atrasado = sandbox().simulateSettlement(payment.externalId!, {
      outcome: "FAILED",
      occurredAt: new Date("2026-08-11T11:00:00Z"),
      eventId: "ev-atrasado",
    });
    const resultado = await processWebhook(
      "sandbox",
      atrasado.body,
      webhookHeaders(atrasado.signature),
      CID,
    );

    expect(resultado.processed).toBe(false);
    expect(resultado.reason).toBe("OUT_OF_ORDER");
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe("PAID");
  });

  it("webhook de cobrança desconhecida não move dinheiro", async () => {
    const corpo = JSON.stringify({
      event_id: "ev-fantasma",
      type: "charge.paid",
      charge_id: "sbx_ch_inexistente",
      status: "PAID",
      amount_cents: 999999,
      occurred_at: new Date().toISOString(),
    });
    const resultado = await processWebhook(
      "sandbox",
      corpo,
      webhookHeaders(sandbox().sign(corpo)),
      CID,
    );

    expect(resultado.processed).toBe(false);
    expect(resultado.reason).toBe("UNKNOWN_CHARGE");
    expect(await prisma.ledgerTransaction.count()).toBe(0);
  });
});

describe("§64, §19 — comissão e snapshot", () => {
  it("alterar a comissão depois não altera ordem já contratada", async () => {
    const { order } = await ordemPaga(30000);
    expect(order.commissionAmountCents).toBe(4500); // 15%

    // Plataforma sobe a comissão para 18%
    await prisma.commissionRule.updateMany({
      where: { scope: "GLOBAL" },
      data: { percentBps: 1800, version: 2 },
    });

    // Nova contratação usa 18%
    const request = await createServiceRequest(
      {
        customerId: cenario.customerProfileId,
        categoryId: cenario.categoryId,
        addressId: cenario.addressId,
        equipmentType: "SPLIT",
        quantity: 1,
        description: "Outra limpeza",
        proposedPriceCents: 30000,
      },
      CID,
    );
    const proposal = await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 30000,
      },
      CID,
    );
    const nova = await acceptProposal(proposal.id, "PRESTADOR", CID);
    expect(nova.commissionAmountCents).toBe(5400); // 18%

    // A ordem antiga permanece intocada
    const antiga = await prisma.marketplaceOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { snapshot: true },
    });
    expect(antiga.commissionAmountCents).toBe(4500);
    expect(antiga.snapshot!.percentBps).toBe(1500);
    expect(antiga.snapshot!.ruleVersion).toBe(1);
  });

  it("regra específica do prestador vence a global", async () => {
    await prisma.commissionRule.create({
      data: {
        name: "Parceiro premium",
        scope: "PROVIDER",
        providerId: cenario.providerProfileId,
        percentBps: 800,
        version: 1,
        active: true,
      },
    });

    const { order } = await ordemPaga(30000);
    expect(order.commissionAmountCents).toBe(2400); // 8%, não 15%

    const snapshot = await prisma.commissionSnapshot.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(snapshot.ruleScope).toBe("PROVIDER");
  });
});

describe("§64, §27 — idempotência de liquidação", () => {
  it("liquidar duas vezes não credita o prestador em dobro", async () => {
    const { order, payment } = await ordemPaga();
    const evento = sandbox().simulateSettlement(payment.externalId!);
    await processWebhook("sandbox", evento.body, webhookHeaders(evento.signature), CID);
    await scheduleService(order.id, new Date("2026-09-01T10:00:00Z"), CID);
    await markProviderEnRoute(order.id, undefined, CID);
    await startService(order.id, CID);
    await requestServiceCompletion(order.id, CID);
    await confirmServiceCompletion(order.id, CID);

    await settleOrder(order.id, CID);
    // Segunda chamada: a ordem já está LIQUIDADA
    await expect(settleOrder(order.id, CID)).rejects.toThrow(/não pode ser liquidada/);

    const liquidacoes = await prisma.ledgerTransaction.findMany({
      where: { type: "COMMISSION" },
    });
    expect(liquidacoes).toHaveLength(1);

    const saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.pendingCents).toBe(23800);
  });

  it("job de liberação rodando duas vezes não libera em dobro", async () => {
    const { order, payment } = await ordemPaga();
    const evento = sandbox().simulateSettlement(payment.externalId!);
    await processWebhook("sandbox", evento.body, webhookHeaders(evento.signature), CID);
    await scheduleService(order.id, new Date("2026-09-01T10:00:00Z"), CID);
    await markProviderEnRoute(order.id, undefined, CID);
    await startService(order.id, CID);
    await requestServiceCompletion(order.id, CID);
    await confirmServiceCompletion(order.id, CID);
    await settleOrder(order.id, CID);

    const futuro = new Date(Date.now() + 49 * 3_600_000);
    const primeira = await releaseEligibleBalances(CID, futuro);
    const segunda = await releaseEligibleBalances(CID, futuro);

    expect(primeira.totalCents).toBe(23800);
    expect(segunda.totalCents).toBe(0);

    const saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.availableCents).toBe(23800);
    expect(saldo.pendingCents).toBe(0);
  });
});

describe("§64 — concorrência no saque", () => {
  it("dois repasses simultâneos não sacam o mesmo saldo duas vezes", async () => {
    await ordemComSaldoDisponivel(28000); // disponível: 23800

    const pedido = () =>
      requestPayout(
        {
          providerId: cenario.providerProfileId,
          amountCents: 23800,
          destinationType: "PIX" as const,
          destinationKey: "tecnico@teste.local",
        },
        CID,
      );

    const resultados = await Promise.allSettled([pedido(), pedido()]);
    const aprovados = resultados.filter((r) => r.status === "fulfilled");
    const recusados = resultados.filter((r) => r.status === "rejected");

    // Exatamente um passa; o outro esbarra no saldo insuficiente
    expect(aprovados).toHaveLength(1);
    expect(recusados).toHaveLength(1);

    const saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.availableCents).toBe(0);
    expect(saldo.inTransitCents).toBe(23800);
  });

  it("saque acima do disponível é recusado", async () => {
    await ordemComSaldoDisponivel(28000);

    await expect(
      requestPayout(
        {
          providerId: cenario.providerProfileId,
          amountCents: 23801,
          destinationType: "PIX",
          destinationKey: "x@y.z",
        },
        CID,
      ),
    ).rejects.toThrow(/[Ss]aldo disponível/);
  });

  it("confirmar o mesmo repasse duas vezes gera um único lançamento", async () => {
    await ordemComSaldoDisponivel(28000);
    const payout = await requestPayout(
      {
        providerId: cenario.providerProfileId,
        amountCents: 23800,
        destinationType: "PIX",
        destinationKey: "tecnico@teste.local",
      },
      CID,
    );

    await processPayout(payout.id, CID);
    await completePayout(payout.id, "ref-1", CID);
    await completePayout(payout.id, "ref-1", CID); // repetição

    const lancamentos = await prisma.ledgerTransaction.findMany({
      where: { type: "PAYOUT" },
    });
    expect(lancamentos).toHaveLength(1);

    const saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.inTransitCents).toBe(0);
  });
});

describe("§32 — conciliação", () => {
  it("não aponta divergência quando tudo está consistente", async () => {
    await ordemComSaldoDisponivel();
    const { divergences } = await runReconciliation(
      "sandbox",
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000),
      CID,
    );
    expect(divergences).toHaveLength(0);
  });

  it("detecta saldo materializado divergente do ledger", async () => {
    await ordemComSaldoDisponivel();

    // Simula corrupção: alguém alterou o saldo sem passar pelo ledger
    await prisma.providerBalance.update({
      where: { providerId: cenario.providerProfileId },
      data: { availableCents: 99999 },
    });

    const { divergences, run } = await runReconciliation(
      "sandbox",
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000),
      CID,
    );

    expect(run.status).toBe("COM_DIVERGENCIAS");
    const divergencia = divergences.find((d) => d.type === "SALDO_DIVERGENTE");
    expect(divergencia).toBeDefined();
    expect(divergencia!.expectedCents).toBe(23800);
    expect(divergencia!.actualCents).toBe(99999);

    // Conciliação NÃO corrige sozinha — vira pendência para análise (§32)
    const saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.availableCents).toBe(99999);
  });
});

describe("§36 — avaliação exige contratação", () => {
  it("recusa avaliação de ordem não concluída", async () => {
    const { order } = await ordemPaga();
    const { createReview } = await import("@/server/services/request-service");

    await expect(
      createReview(
        { orderId: order.id, customerId: cenario.customerProfileId, rating: 5 },
        CID,
      ),
    ).rejects.toThrow(/serviço concluído/);
  });

  it("recusa avaliação de cliente que não é o dono da ordem", async () => {
    const order = await ordemComSaldoDisponivel();
    const { createReview } = await import("@/server/services/request-service");

    const outro = await prisma.user.create({
      data: {
        email: "outro@teste.local",
        name: "Outro Cliente",
        passwordHash: "x",
        role: "CUSTOMER",
        customerProfile: { create: {} },
      },
      include: { customerProfile: true },
    });

    await expect(
      createReview(
        {
          orderId: order.id,
          customerId: outro.customerProfile!.id,
          rating: 5,
        },
        CID,
      ),
    ).rejects.toThrow(/[Ss]omente o cliente/);
  });

  it("impede duas avaliações para a mesma ordem", async () => {
    const order = await ordemComSaldoDisponivel();
    const { createReview } = await import("@/server/services/request-service");

    await createReview(
      { orderId: order.id, customerId: cenario.customerProfileId, rating: 5 },
      CID,
    );
    await expect(
      createReview(
        { orderId: order.id, customerId: cenario.customerProfileId, rating: 1 },
        CID,
      ),
    ).rejects.toThrow();

    expect(await prisma.review.count({ where: { orderId: order.id } })).toBe(1);
  });
});

describe("§14 — trava do valor após o aceite", () => {
  it("não aceita nova proposta depois do valor fechado", async () => {
    const { request, order } = await ordemPaga();
    expect(order.status).toBe("AGUARDANDO_PAGAMENTO");

    await expect(
      createProposal(
        {
          requestId: request.id,
          providerId: cenario.providerProfileId,
          author: "CLIENTE",
          amountCents: 10000,
        },
        CID,
      ),
    ).rejects.toThrow(/não aceita propostas|já aceito/);
  });

  it("quem propõe não pode aceitar a própria proposta", async () => {
    const request = await createServiceRequest(
      {
        customerId: cenario.customerProfileId,
        categoryId: cenario.categoryId,
        addressId: cenario.addressId,
        equipmentType: "SPLIT",
        quantity: 1,
        description: "Limpeza",
        proposedPriceCents: 20000,
      },
      CID,
    );
    const proposta = await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 20000,
      },
      CID,
    );

    await expect(acceptProposal(proposta.id, "CLIENTE", CID)).rejects.toThrow(
      /outra parte/,
    );
  });
});
