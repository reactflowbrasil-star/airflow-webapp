/**
 * Chat da negociação contra PostgreSQL real (§15).
 *
 * Verifica o que a tela de Mensagens promete: a conversa nasce sozinha na
 * primeira proposta, cada evento do ciclo entra no fio com o tipo certo, e o
 * texto livre nunca carrega dado de contato para o outro lado.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { REDACTED } from "@/domain/messaging/contact-guard";
import { prisma } from "@/server/db/prisma";
import { createCheckout, processWebhook } from "@/server/services/payment-service";
import { acceptProposal, createProposal } from "@/server/services/proposal-service";
import { createServiceRequest } from "@/server/services/request-service";
import {
  confirmServiceCompletion,
  markProviderEnRoute,
  requestServiceCompletion,
  scheduleService,
  startService,
} from "@/server/services/execution-service";
import {
  carregarConversa,
  enviarMensagem,
  marcarComoLidas,
} from "@/server/services/message-service";
import {
  criarCenarioBase,
  resetDatabase,
  sandbox,
  webhookHeaders,
  type Cenario,
} from "./helpers";

const CID = "test-chat";

let cenario: Cenario;

beforeEach(async () => {
  await resetDatabase();
  cenario = await criarCenarioBase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function solicitacao() {
  return createServiceRequest(
    {
      customerId: cenario.customerProfileId,
      categoryId: cenario.categoryId,
      addressId: cenario.addressId,
      equipmentType: "SPLIT",
      quantity: 2,
      description: "Dois splits de 12.000 BTUs precisando de limpeza.",
      proposedPriceCents: 28000,
      urgency: "NORMAL",
    },
    CID,
  );
}

describe("conversa da negociação", () => {
  it("nasce na primeira proposta, sem ninguém criar explicitamente", async () => {
    const request = await solicitacao();

    expect(await prisma.conversation.count()).toBe(0);

    await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 28000,
      },
      CID,
    );

    const conversa = await prisma.conversation.findFirstOrThrow({
      include: { messages: true },
    });
    expect(conversa.requestId).toBe(request.id);
    expect(conversa.customerId).toBe(cenario.customerProfileId);
    expect(conversa.providerId).toBe(cenario.providerProfileId);
    expect(conversa.lastMessageAt).not.toBeNull();
    expect(conversa.messages).toHaveLength(1);
    expect(conversa.messages[0].type).toBe("PROPOSAL");
    // `\s` e não um espaço literal: Intl usa espaço não separável (U+00A0)
    // entre o símbolo e o valor, e colar o caractere invisível aqui só criaria
    // um teste que quebra na próxima vez que alguém reescrever a linha.
    expect(conversa.messages[0].content).toMatch(/R\$\s280,00/);
  });

  it("reaproveita a mesma conversa nas rodadas seguintes", async () => {
    const request = await solicitacao();

    await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 28000,
      },
      CID,
    );
    await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "PRESTADOR",
        amountCents: 31000,
      },
      CID,
    );

    expect(await prisma.conversation.count()).toBe(1);

    const conversa = await prisma.conversation.findFirstOrThrow();
    const mensagens = await carregarConversa(conversa.id, {
      userId: cenario.customerUserId,
      papel: "CLIENTE",
    });

    expect(mensagens.map((m) => m.tipo)).toEqual(["PROPOSAL", "COUNTER_PROPOSAL"]);
    // Lado da bolha vem do autor, não do remetente: proposta não tem senderId.
    expect(mensagens[0].minha).toBe(true);
    expect(mensagens[1].minha).toBe(false);
  });

  it("espelha os lados para o prestador", async () => {
    const request = await solicitacao();
    await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 28000,
      },
      CID,
    );

    const conversa = await prisma.conversation.findFirstOrThrow();
    const mensagens = await carregarConversa(conversa.id, {
      userId: cenario.providerUserId,
      papel: "PRESTADOR",
    });

    expect(mensagens[0].minha).toBe(false);
  });

  it("registra cada evento do ciclo no fio, com o tipo do §15", async () => {
    const request = await solicitacao();
    const proposta = await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 28000,
      },
      CID,
    );
    const order = await acceptProposal(proposta.id, "PRESTADOR", CID);

    const payment = await createCheckout({ orderId: order.id, method: "PIX" }, CID);
    const evento = sandbox().simulateSettlement(payment.externalId!);
    await processWebhook("sandbox", evento.body, webhookHeaders(evento.signature), CID);

    await scheduleService(order.id, new Date(Date.now() + 86_400_000), CID);
    await markProviderEnRoute(order.id, 30, CID);
    await startService(order.id, CID);
    await requestServiceCompletion(order.id, CID);
    await confirmServiceCompletion(order.id, CID);

    const conversa = await prisma.conversation.findFirstOrThrow();
    const mensagens = await carregarConversa(conversa.id, {
      userId: cenario.customerUserId,
      papel: "CLIENTE",
    });

    expect(mensagens.map((m) => m.tipo)).toEqual([
      "PROPOSAL",
      "VALUE_ACCEPTED",
      "PAYMENT",
      "SCHEDULING",
      "SYSTEM",
      "SERVICE_STARTED",
      "SERVICE_COMPLETED",
      "SERVICE_COMPLETED",
    ]);

    // O fio está em ordem cronológica — é o que a mediação vai ler (§39).
    const instantes = mensagens.map((m) => new Date(m.quando).getTime());
    expect([...instantes].sort((a, b) => a - b)).toEqual(instantes);
  });
});

describe("envio de texto livre", () => {
  async function conversaAberta() {
    const request = await solicitacao();
    await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 28000,
      },
      CID,
    );
    return prisma.conversation.findFirstOrThrow();
  }

  it("grava a mensagem do participante e atualiza o topo da lista", async () => {
    const conversa = await conversaAberta();
    const antes = conversa.lastMessageAt;

    const enviada = await enviarMensagem({
      conversationId: conversa.id,
      senderUserId: cenario.customerUserId,
      texto: "Consigo na quinta à tarde?",
      correlationId: CID,
    });

    expect(enviada.redigida).toBe(false);
    expect(enviada.content).toBe("Consigo na quinta à tarde?");

    const atualizada = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversa.id },
    });
    expect(atualizada.lastMessageAt!.getTime()).toBeGreaterThanOrEqual(
      antes!.getTime(),
    );
  });

  it("suprime dados de contato antes de persistir", async () => {
    const conversa = await conversaAberta();

    const enviada = await enviarMensagem({
      conversationId: conversa.id,
      senderUserId: cenario.customerUserId,
      texto: "me chama no zap (11) 98877-1200",
      correlationId: CID,
    });

    expect(enviada.redigida).toBe(true);
    expect(enviada.content).toContain(REDACTED);

    // O dado não pode estar em lugar nenhum do banco — nem na mensagem, nem
    // no log de auditoria que registra a supressão.
    const persistida = await prisma.message.findUniqueOrThrow({
      where: { id: enviada.id },
    });
    expect(persistida.content).not.toContain("8877");

    const auditoria = await prisma.auditLog.findFirstOrThrow({
      where: { action: "MESSAGE_CONTACT_REDACTED", entityId: enviada.id },
    });
    expect(JSON.stringify(auditoria.newValue)).not.toContain("8877");
    expect(auditoria.userId).toBe(cenario.customerUserId);
  });

  it("recusa quem não participa da conversa, sem revelar que ela existe", async () => {
    const conversa = await conversaAberta();
    const intruso = await prisma.user.create({
      data: {
        email: "intruso@teste.local",
        name: "Intruso",
        passwordHash: "x",
        role: "CUSTOMER",
        customerProfile: { create: {} },
      },
    });

    await expect(
      enviarMensagem({
        conversationId: conversa.id,
        senderUserId: intruso.id,
        texto: "oi",
        correlationId: CID,
      }),
    ).rejects.toThrow(/não encontrada/i);

    // A recusa não pode ter deixado rastro na conversa alheia.
    expect(await prisma.message.count({ where: { senderId: intruso.id } })).toBe(0);
  });

  it("dá a mesma resposta para conversa inexistente", async () => {
    await expect(
      enviarMensagem({
        conversationId: "conversa-que-nao-existe",
        senderUserId: cenario.customerUserId,
        texto: "oi",
        correlationId: CID,
      }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it("recusa texto vazio e texto acima do limite", async () => {
    const conversa = await conversaAberta();

    await expect(
      enviarMensagem({
        conversationId: conversa.id,
        senderUserId: cenario.customerUserId,
        texto: "   ",
        correlationId: CID,
      }),
    ).rejects.toThrow(/antes de enviar/i);

    await expect(
      enviarMensagem({
        conversationId: conversa.id,
        senderUserId: cenario.customerUserId,
        texto: "a".repeat(2001),
        correlationId: CID,
      }),
    ).rejects.toThrow(/2000/);
  });
});

describe("leitura", () => {
  it("marca como lidas só as mensagens do outro lado", async () => {
    const request = await solicitacao();
    await createProposal(
      {
        requestId: request.id,
        providerId: cenario.providerProfileId,
        author: "CLIENTE",
        amountCents: 28000,
      },
      CID,
    );
    const conversa = await prisma.conversation.findFirstOrThrow();

    const minha = await enviarMensagem({
      conversationId: conversa.id,
      senderUserId: cenario.customerUserId,
      texto: "Bom dia!",
      correlationId: CID,
    });
    const dele = await enviarMensagem({
      conversationId: conversa.id,
      senderUserId: cenario.providerUserId,
      texto: "Bom dia, posso amanhã às 14h.",
      correlationId: CID,
    });

    await marcarComoLidas(conversa.id, cenario.customerUserId);

    expect(
      (await prisma.message.findUniqueOrThrow({ where: { id: dele.id } })).readAt,
    ).not.toBeNull();
    expect(
      (await prisma.message.findUniqueOrThrow({ where: { id: minha.id } })).readAt,
    ).toBeNull();
  });
});
