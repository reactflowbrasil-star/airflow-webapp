/**
 * Integração n8n: autenticação HMAC/replay, comandos idempotentes, outbox
 * com retry/dead-letter, conclusão em 2 passos, recusa e disputa bloqueando
 * repasse. Tudo contra Postgres real e chamando os route handlers de verdade.
 */

import { createHmac, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { dispatchPendingEvents, emitEvent } from "@/server/events";
import { POST as comandosPOST } from "@/app/api/n8n/comandos/route";
import { GET as consultaGET } from "@/app/api/n8n/negociacoes/[id]/route";
import { createServiceRequest } from "@/server/services/request-service";
import { createProposal } from "@/server/services/proposal-service";
import { createCheckout, processWebhook } from "@/server/services/payment-service";
import {
  confirmServiceCompletion,
  releaseEligibleBalances,
  requestServiceCompletion,
  scheduleService,
  settleOrder,
  startService,
} from "@/server/services/execution-service";
import { requestPayout } from "@/server/services/payout-service";
import { openDispute } from "@/server/services/dispute-service";
import {
  criarCenarioBase,
  resetDatabase,
  sandbox,
  webhookHeaders,
  type Cenario,
} from "./helpers";

const CID = "n8n-test-cid";
const SECRET = process.env.BACKEND_WEBHOOK_SECRET!;

let cenario: Cenario;

beforeEach(async () => {
  await resetDatabase();
  cenario = await criarCenarioBase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Assina como o n8n assinaria: HMAC(timestamp.nonce.body). */
function assinar(body: string, overrides: Partial<Record<string, string>> = {}) {
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = overrides.nonce ?? randomUUID();
  const signature =
    overrides.signature ??
    createHmac("sha256", SECRET).update(`${timestamp}.${nonce}.${body}`).digest("hex");
  return new Headers({
    "content-type": "application/json",
    "x-n8n-timestamp": timestamp,
    "x-n8n-nonce": nonce,
    "x-n8n-signature": signature,
  });
}

function comando(body: Record<string, unknown>, headers?: Headers) {
  const raw = JSON.stringify(body);
  return comandosPOST(
    new Request("http://test/api/n8n/comandos", {
      method: "POST",
      headers: headers ?? assinar(raw),
      body: raw,
    }),
  );
}

async function negociacaoComPropostaDoCliente(amountCents = 25000) {
  const request = await createServiceRequest(
    {
      customerId: cenario.customerProfileId,
      categoryId: cenario.categoryId,
      addressId: cenario.addressId,
      equipmentType: "SPLIT",
      quantity: 1,
      description: "Limpeza de split",
      proposedPriceCents: amountCents,
    },
    CID,
  );
  await createProposal(
    {
      requestId: request.id,
      providerId: cenario.providerProfileId,
      author: "CLIENTE",
      amountCents,
    },
    CID,
  );
  return request;
}

describe("Segurança dos webhooks n8n → backend", () => {
  it("recusa chamada sem cabeçalhos de assinatura", async () => {
    const raw = JSON.stringify({ command: "ordem.iniciar", order_id: "x", idempotency_key: randomUUID() });
    const res = await comandosPOST(
      new Request("http://test/api/n8n/comandos", { method: "POST", body: raw }),
    );
    expect(res.status).toBe(401);
  });

  it("recusa assinatura inválida", async () => {
    const raw = JSON.stringify({ command: "ordem.iniciar", order_id: "x", idempotency_key: randomUUID() });
    const res = await comando(JSON.parse(raw), assinar(raw, { signature: "0".repeat(64) }));
    expect(res.status).toBe(401);
  });

  it("recusa timestamp fora da janela (replay antigo)", async () => {
    const raw = JSON.stringify({ command: "ordem.iniciar", order_id: "x", idempotency_key: randomUUID() });
    const velho = String(Math.floor(Date.now() / 1000) - 3600);
    const res = await comando(JSON.parse(raw), assinar(raw, { timestamp: velho }));
    expect(res.status).toBe(401);
  });

  it("recusa nonce reutilizado (replay attack)", async () => {
    const request = await negociacaoComPropostaDoCliente();
    const body = {
      command: "proposta.responder",
      request_id: request.id,
      provider_id: cenario.providerProfileId,
      actor: "PRESTADOR",
      action: "CONTRAPROPOSTA",
      amount_cents: 30000,
      idempotency_key: randomUUID(),
    };
    const raw = JSON.stringify(body);
    const headers = assinar(raw);

    const primeira = await comando(body, headers);
    expect(primeira.status).toBe(200);

    // Mesmos cabeçalhos, mesma assinatura: replay literal
    const replay = await comando(body, headers);
    expect(replay.status).toBe(401);
  });
});

describe("Comandos do n8n — negociação completa pelo canal oficial", () => {
  it("contraproposta do profissional → aceite do cliente → ordem criada", async () => {
    const request = await negociacaoComPropostaDoCliente(25000);

    const contra = await comando({
      command: "proposta.responder",
      request_id: request.id,
      provider_id: cenario.providerProfileId,
      actor: "PRESTADOR",
      action: "CONTRAPROPOSTA",
      amount_cents: 32000,
      idempotency_key: randomUUID(),
    });
    expect(contra.status).toBe(200);
    const corpoContra = await contra.json();
    expect(corpoContra.result.version).toBe(2);

    const aceite = await comando({
      command: "proposta.responder",
      request_id: request.id,
      provider_id: cenario.providerProfileId,
      actor: "CLIENTE",
      action: "ACEITAR",
      idempotency_key: randomUUID(),
    });
    expect(aceite.status).toBe(200);
    const corpoAceite = await aceite.json();
    expect(corpoAceite.result.status).toBe("AGUARDANDO_PAGAMENTO");
    expect(corpoAceite.result.gross_amount_cents).toBe(32000);

    // Outbox registrou a trilha completa da negociação
    const tipos = (await prisma.outboundEvent.findMany({ orderBy: { createdAt: "asc" } })).map(
      (e) => e.eventType,
    );
    expect(tipos).toContain("proposal.created");
    expect(tipos).toContain("proposal.countered");
    expect(tipos).toContain("proposal.accepted");
    expect(tipos).toContain("negotiation.completed");
    expect(tipos).toContain("payment.requested");
  });

  it("comando repetido com a mesma idempotency_key não duplica efeito", async () => {
    const request = await negociacaoComPropostaDoCliente();
    const key = randomUUID();
    const body = {
      command: "proposta.responder",
      request_id: request.id,
      provider_id: cenario.providerProfileId,
      actor: "PRESTADOR",
      action: "CONTRAPROPOSTA",
      amount_cents: 30000,
      idempotency_key: key,
    };

    const primeira = await comando(body);
    expect(primeira.status).toBe(200);
    // Retry do n8n: novo nonce, mesma idempotency_key
    const segunda = await comando(body);
    expect(segunda.status).toBe(200);
    expect(segunda.headers.get("x-idempotent-replay")).toBe("true");

    const propostas = await prisma.proposal.count({ where: { requestId: request.id } });
    expect(propostas).toBe(2); // a do cliente + UMA contraproposta
  });

  it("recusa do profissional reabre a solicitação", async () => {
    const request = await negociacaoComPropostaDoCliente();
    const res = await comando({
      command: "proposta.responder",
      request_id: request.id,
      provider_id: cenario.providerProfileId,
      actor: "PRESTADOR",
      action: "RECUSAR",
      idempotency_key: randomUUID(),
    });
    expect(res.status).toBe(200);

    expect(
      (await prisma.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
    ).toBe("ABERTA");
    const tipos = (await prisma.outboundEvent.findMany()).map((e) => e.eventType);
    expect(tipos).toContain("proposal.rejected");
  });

  it("consulta sanitizada nunca expõe contatos e esconde endereço antes do pagamento", async () => {
    const request = await negociacaoComPropostaDoCliente();
    const res = await consultaGET(
      new Request(`http://test/api/n8n/negociacoes/${request.id}`, {
        headers: assinar(""),
      }),
      { params: Promise.resolve({ id: request.id }) },
    );
    expect(res.status).toBe(200);
    const corpo = await res.json();
    const texto = JSON.stringify(corpo);

    expect(texto).not.toContain("@teste.local"); // nenhum e-mail
    expect(texto).not.toMatch(/phone|telefone|whatsapp/i);
    expect(corpo.location.street).toBeUndefined(); // endereço só após pagamento
    expect(corpo.location.neighborhood).toBe("Vila Mariana");
    expect(corpo.customer_first_name).toBe("Marina");
  });
});

describe("Outbox — entrega, retry e dead-letter", () => {
  it("o mesmo fato de negócio nunca vira dois eventos", async () => {
    await emitEvent(prisma, {
      type: "service.completed",
      idempotencyKey: "service.completed:dup-test",
      data: { order_id: "o1" },
    });
    await emitEvent(prisma, {
      type: "service.completed",
      idempotencyKey: "service.completed:dup-test",
      data: { order_id: "o1" },
    });
    expect(await prisma.outboundEvent.count()).toBe(1);
  });

  it("falha de entrega segue o backoff 30s/2m/10m/30m e termina em DEAD_LETTER", async () => {
    // N8N_WEBHOOK_URL de teste aponta para porta inalcançável — toda entrega falha
    await emitEvent(prisma, {
      type: "payment.confirmed",
      idempotencyKey: "payment.confirmed:dlq-test",
      data: { order_id: "o1" },
    });

    const base = new Date();
    const primeira = await dispatchPendingEvents(base);
    expect(primeira.failed).toBe(1);

    let evento = await prisma.outboundEvent.findUniqueOrThrow({
      where: { idempotencyKey: "payment.confirmed:dlq-test" },
    });
    expect(evento.attempts).toBe(1);
    expect(evento.status).toBe("PENDING");
    // 2ª tentativa agendada para +30s
    expect(evento.nextAttemptAt.getTime() - base.getTime()).toBeGreaterThanOrEqual(29_000);

    // Avança o relógio por todas as janelas até esgotar
    let agora = base;
    for (const salto of [31, 121, 601, 1801]) {
      agora = new Date(agora.getTime() + salto * 1000);
      await dispatchPendingEvents(agora);
    }

    evento = await prisma.outboundEvent.findUniqueOrThrow({
      where: { idempotencyKey: "payment.confirmed:dlq-test" },
    });
    expect(evento.status).toBe("DEAD_LETTER");
    expect(evento.attempts).toBe(5);
    expect(evento.lastError).toBeTruthy();
  });
});

describe("Conclusão em dois passos e disputa bloqueando repasse", () => {
  async function ordemEmExecucao() {
    const request = await negociacaoComPropostaDoCliente(28000);
    const aceite = await comando({
      command: "proposta.responder",
      request_id: request.id,
      provider_id: cenario.providerProfileId,
      actor: "PRESTADOR",
      action: "ACEITAR",
      idempotency_key: randomUUID(),
    });
    const { result } = await aceite.json();
    const payment = await createCheckout({ orderId: result.order_id, method: "PIX" }, CID);
    const ev = sandbox().simulateSettlement(payment.externalId!);
    await processWebhook("sandbox", ev.body, webhookHeaders(ev.signature), CID);
    await scheduleService(result.order_id, new Date("2026-09-10T10:00:00Z"), CID);
    await startService(result.order_id, CID);
    return result.order_id as string;
  }

  it("profissional solicita; só a confirmação do cliente conclui a ordem", async () => {
    const orderId = await ordemEmExecucao();

    await requestServiceCompletion(orderId, CID);
    let ordem = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(ordem.status).toBe("EM_EXECUCAO"); // ainda não concluída

    // Liquidar antes da confirmação do cliente é recusado
    await expect(settleOrder(orderId, CID)).rejects.toThrow(/não pode ser liquidada/);

    await confirmServiceCompletion(orderId, CID);
    ordem = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(ordem.status).toBe("CONCLUIDA");

    const tipos = (await prisma.outboundEvent.findMany()).map((e) => e.eventType);
    expect(tipos).toContain("service.completed_requested");
    expect(tipos).toContain("service.completed");
    expect(tipos).toContain("review.requested");
  });

  it("disputa após liberação bloqueia o saldo e impede o repasse", async () => {
    const orderId = await ordemEmExecucao();
    await requestServiceCompletion(orderId, CID);
    await confirmServiceCompletion(orderId, CID);
    await settleOrder(orderId, CID);
    await releaseEligibleBalances(CID, new Date(Date.now() + 49 * 3_600_000));

    const disputa = await openDispute(
      { orderId, reason: "SERVICO_INCOMPLETO", description: "Serviço ficou incompleto" },
      CID,
    );
    expect(disputa.blockedAmountCents).toBe(23800); // líquido de 28000 a 15%

    const saldo = await prisma.providerBalance.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(saldo.blockedCents).toBe(23800);
    expect(saldo.availableCents).toBe(0);

    await expect(
      requestPayout(
        {
          providerId: cenario.providerProfileId,
          amountCents: 23800,
          destinationType: "PIX",
          destinationKey: "x@y.z",
        },
        CID,
      ),
    ).rejects.toThrow(/[Ss]aldo disponível|MANUAL_REVIEW|revisão manual/);

    const tipos = (await prisma.outboundEvent.findMany()).map((e) => e.eventType);
    expect(tipos).toContain("dispute.created");
  });

  it("repasse de alto valor em conta recém-criada cai em MANUAL_REVIEW", async () => {
    // Conta nova (+30) e valor >= R$ 10.000 (+30) = 60 → bloqueio antifraude
    await prisma.providerBalance.update({
      where: { providerId: cenario.providerProfileId },
      data: { availableCents: 1_200_000 },
    });
    await expect(
      requestPayout(
        {
          providerId: cenario.providerProfileId,
          amountCents: 1_000_000,
          destinationType: "PIX",
          destinationKey: "x@y.z",
        },
        CID,
      ),
    ).rejects.toThrow(/revisão manual/);

    const auditoria = await prisma.auditLog.findFirst({
      where: { action: "PAYOUT_RISK_BLOCKED" },
    });
    expect(auditoria).not.toBeNull();
  });
});
