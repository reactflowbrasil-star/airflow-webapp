/**
 * Critério de sucesso ponta a ponta (§69).
 *
 * Este é o teste que decide se o sistema é funcional. Roda contra PostgreSQL
 * real e percorre todo o ciclo comercial, verificando em cada etapa o estado
 * do banco, do ledger e dos saldos.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { createServiceRequest, createReview } from "@/server/services/request-service";
import { acceptProposal, createProposal } from "@/server/services/proposal-service";
import { createCheckout, processWebhook } from "@/server/services/payment-service";
import {
  completeService,
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

const CID = "test-correlation-id";

let cenario: Cenario;

beforeEach(async () => {
  await resetDatabase();
  cenario = await criarCenarioBase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("§69 — fluxo ponta a ponta", () => {
  it("percorre da solicitação à avaliação com o dinheiro certo em cada etapa", async () => {
    // ── CLIENTE SOLICITA ──────────────────────────────────────────────────
    const request = await createServiceRequest(
      {
        customerId: cenario.customerProfileId,
        categoryId: cenario.categoryId,
        addressId: cenario.addressId,
        equipmentType: "SPLIT",
        quantity: 2,
        btus: 12000,
        description: "Limpeza de 2 aparelhos split na sala e no quarto",
        proposedPriceCents: 25000, // cliente propõe R$ 250
        searchQuery: "limpeza de ar condicionado",
      },
      CID,
    );
    expect(request.status).toBe("ABERTA");

    // ── CLIENTE PROPÕE R$ 250 ─────────────────────────────────────────────
    const propostaCliente = await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 25000,
      },
      CID,
    );
    expect(propostaCliente.version).toBe(1);

    // ── TÉCNICO CONTRAPROPÕE R$ 320 ───────────────────────────────────────
    const contraproposta = await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "PRESTADOR",
        amountCents: 32000,
      },
      CID,
    );
    expect(contraproposta.version).toBe(2);
    expect(contraproposta.previousProposalId).toBe(propostaCliente.id);
    expect(
      (await prisma.proposal.findUniqueOrThrow({ where: { id: propostaCliente.id } }))
        .status,
    ).toBe("CONTRAPROPOSTA");

    // ── CLIENTE NEGOCIA R$ 280 ────────────────────────────────────────────
    const contrapropostaCliente = await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 28000,
      },
      CID,
    );
    expect(contrapropostaCliente.version).toBe(3);

    // ── TÉCNICO ACEITA R$ 280 → ORDER + SNAPSHOT ──────────────────────────
    const order = await acceptProposal(contrapropostaCliente.id, "PRESTADOR", CID);

    expect(order.status).toBe("AGUARDANDO_PAGAMENTO");
    expect(order.grossAmountCents).toBe(28000);
    expect(order.commissionAmountCents).toBe(4200); // 15% de R$ 280
    expect(order.providerNetAmountCents).toBe(23800);
    expect(order.commissionAmountCents + order.providerNetAmountCents).toBe(
      order.grossAmountCents,
    );

    const snapshot = await prisma.commissionSnapshot.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(snapshot.percentBps).toBe(1500);
    expect(snapshot.ruleVersion).toBe(1);

    expect(
      (await prisma.serviceRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe("CONTRATADA");

    // ── CLIENTE PAGA (PIX) ────────────────────────────────────────────────
    const payment = await createCheckout({ orderId: order.id, method: "PIX" }, CID);
    expect(payment.status).toBe("PENDING");
    expect(payment.pixCopyPaste).toBeTruthy();
    expect(payment.amountCents).toBe(28000);

    // Ninguém foi creditado antes da confirmação do PSP
    expect(await prisma.ledgerTransaction.count()).toBe(0);

    // ── PSP CONFIRMA VIA WEBHOOK ──────────────────────────────────────────
    const evento = sandbox().simulateSettlement(payment.externalId!);
    expect(evento.status).toBe("PAID");

    const resultado = await processWebhook(
      "sandbox",
      evento.body,
      webhookHeaders(evento.signature),
      CID,
    );
    expect(resultado.processed).toBe(true);

    const pago = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pago.status).toBe("PAID");
    expect(pago.paidAt).not.toBeNull();

    // Ledger: caixa debitado, escrow creditado
    const capture = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { idempotencyKey: `payment-captured:${payment.id}` },
      include: { entries: { include: { account: true } } },
    });
    expect(capture.entries).toHaveLength(2);
    expect(
      capture.entries.find((e) => e.account.code === "PLATFORM_CASH")?.direction,
    ).toBe("DEBIT");
    expect(
      capture.entries.find((e) => e.account.code === "CUSTOMER_ESCROW")?.amountCents,
    ).toBe(28000);

    expect(
      (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("PAGA");

    // Prestador ainda não tem nada — o serviço nem começou
    let saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.pendingCents).toBe(0);
    expect(saldo.availableCents).toBe(0);

    // ── AGENDAMENTO ───────────────────────────────────────────────────────
    const agendamento = await scheduleService(
      order.id,
      new Date("2026-08-15T14:00:00Z"),
      CID,
    );
    expect(agendamento.status).toBe("CONFIRMADO");

    // ── EXECUÇÃO ──────────────────────────────────────────────────────────
    const emAndamento = await startService(order.id, CID);
    expect(emAndamento.status).toBe("EM_ANDAMENTO");
    expect(emAndamento.enRouteAt).not.toBeNull();

    const concluida = await completeService(order.id, CID);
    expect(concluida.status).toBe("CONCLUIDA");
    expect(concluida.completedAt).not.toBeNull();

    // ── LIQUIDAÇÃO: COMISSÃO RECONHECIDA ──────────────────────────────────
    const liquidada = await settleOrder(order.id, CID);
    expect(liquidada.status).toBe("LIQUIDADA");

    const settlement = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { idempotencyKey: `settlement:${order.id}` },
      include: { entries: { include: { account: true } } },
    });
    expect(
      settlement.entries.find((e) => e.account.code === "PLATFORM_REVENUE")?.amountCents,
    ).toBe(4200);
    expect(
      settlement.entries.find((e) =>
        e.account.code.startsWith("PROVIDER_PAYABLE:"),
      )?.amountCents,
    ).toBe(23800);

    // O líquido entra como PENDENTE, não como disponível
    saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.pendingCents).toBe(23800);
    expect(saldo.availableCents).toBe(0);

    // ── JANELA DE SEGURANÇA ───────────────────────────────────────────────
    // Antes de vencer, nada é liberado
    const cedo = await releaseEligibleBalances(CID, new Date(Date.now() + 3_600_000));
    expect(cedo.releasedOrders).toHaveLength(0);

    // Depois de 48h, libera
    const depois = new Date(Date.now() + 49 * 3_600_000);
    const liberado = await releaseEligibleBalances(CID, depois);
    expect(liberado.releasedOrders).toContain(order.id);
    expect(liberado.totalCents).toBe(23800);

    saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.pendingCents).toBe(0);
    expect(saldo.availableCents).toBe(23800);

    // ── REPASSE ───────────────────────────────────────────────────────────
    const payout = await requestPayout(
      {
        providerId: cenario.providerProfileId,
        amountCents: 23800,
        destinationType: "PIX",
        destinationKey: "tecnico@teste.local",
      },
      CID,
    );
    expect(payout.status).toBe("REQUESTED");

    saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.availableCents).toBe(0);
    expect(saldo.inTransitCents).toBe(23800);

    await processPayout(payout.id, CID);
    const pagoPayout = await completePayout(payout.id, "psp_ref_123", CID);
    expect(pagoPayout.status).toBe("PAID");

    saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.inTransitCents).toBe(0);
    expect(
      saldo.pendingCents + saldo.availableCents + saldo.blockedCents + saldo.inTransitCents,
    ).toBe(0);

    // ── CONCILIAÇÃO ───────────────────────────────────────────────────────
    const { divergences } = await runReconciliation(
      "sandbox",
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000),
      CID,
    );
    expect(divergences).toHaveLength(0);

    // ── CLIENTE AVALIA ────────────────────────────────────────────────────
    const review = await createReview(
      {
        orderId: order.id,
        customerId: cenario.customerProfileId,
        rating: 5,
        qualityRating: 5,
        punctualityRating: 4,
        comment: "Serviço impecável, chegou no horário.",
      },
      CID,
    );
    expect(review.rating).toBe(5);

    const perfil = await prisma.providerProfile.findUniqueOrThrow({
      where: { id: cenario.providerProfileId },
    });
    expect(perfil.ratingCount).toBe(1);
    expect(perfil.completedServices).toBe(1);
    // Reputação bayesiana: 1 nota 5 não vira score 5 (§37)
    expect(perfil.reputationScore).toBeLessThan(5);
    expect(perfil.reputationScore).toBeGreaterThan(0);

    // ── INVARIANTE FINAL: O LEDGER FECHA EM ZERO ──────────────────────────
    const entries = await prisma.ledgerEntry.findMany({
      select: { direction: true, amountCents: true, account: { select: { code: true } } },
    });
    const net = entries.reduce(
      (acc, e) => acc + (e.direction === "DEBIT" ? e.amountCents : -e.amountCents),
      0,
    );
    expect(net).toBe(0);

    // Sobrou exatamente a comissão no caixa da plataforma
    const caixa = entries
      .filter((e) => e.account.code === "PLATFORM_CASH")
      .reduce(
        (acc, e) => acc + (e.direction === "DEBIT" ? e.amountCents : -e.amountCents),
        0,
      );
    expect(caixa).toBe(4200);
  });
});

describe("§70 — regra de ouro: rastreabilidade de cada centavo", () => {
  it("responde de onde veio, qual regra aplicou e para quem foi", async () => {
    const request = await createServiceRequest(
      {
        customerId: cenario.customerProfileId,
        categoryId: cenario.categoryId,
        addressId: cenario.addressId,
        equipmentType: "SPLIT",
        quantity: 1,
        description: "Limpeza",
        proposedPriceCents: 30000,
      },
      CID,
    );
    const proposta = await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 30000,
      },
      CID,
    );
    const order = await acceptProposal(proposta.id, "PRESTADOR", CID);
    const payment = await createCheckout({ orderId: order.id, method: "PIX" }, CID);
    const evento = sandbox().simulateSettlement(payment.externalId!);
    await processWebhook("sandbox", evento.body, webhookHeaders(evento.signature), CID);
    await scheduleService(order.id, new Date("2026-08-20T10:00:00Z"), CID);
    await startService(order.id, CID);
    await completeService(order.id, CID);
    await settleOrder(order.id, CID);

    // Partindo de um lançamento, chegamos a todas as 19 respostas do §70
    const lancamento = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { idempotencyKey: `settlement:${order.id}` },
      include: {
        entries: { include: { account: true } },
        order: {
          include: {
            snapshot: true,
            customer: { include: { user: true } },
            provider: true,
            payments: true,
            refunds: true,
            chargebacks: true,
          },
        },
      },
    });

    const o = lancamento.order!;
    expect(o.customer.user.email).toBe("cliente@teste.local"); // qual cliente pagou
    expect(o.requestId).toBe(request.id); // qual serviço gerou
    expect(o.reference).toMatch(/^AF-\d{4}-\d{6}$/); // qual ordem representa
    expect(o.grossAmountCents).toBe(30000); // valor bruto
    expect(o.snapshot!.commissionAmountCents).toBe(4500); // comissão aplicada
    expect(o.snapshot!.ruleId).toBeTruthy(); // qual regra
    expect(o.snapshot!.ruleVersion).toBe(1); // qual versão
    expect(o.providerNetAmountCents).toBe(25500); // valor líquido
    expect(o.provider.id).toBe(cenario.providerProfileId); // quem recebe
    expect(o.payments[0].provider).toBe("sandbox"); // qual gateway
    expect(o.payments[0].externalId).toBeTruthy(); // referência externa
    expect(o.payments[0].status).toBe("PAID"); // status
    expect(o.refunds).toHaveLength(0); // foi estornado?
    expect(o.chargebacks).toHaveLength(0); // foi contestado?
    expect(lancamento.correlationId).toBe(CID); // quem originou
    expect(lancamento.createdAt).toBeInstanceOf(Date); // quando
    expect(lancamento.entries.length).toBeGreaterThan(0); // existe no ledger

    // E a auditoria registra quem fez o quê (§44)
    const auditoria = await prisma.auditLog.findMany({
      where: { entityId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(auditoria.map((a) => a.action)).toContain("PROPOSAL_ACCEPTED");
    expect(auditoria.map((a) => a.action)).toContain("ORDER_SETTLED");
  });
});
