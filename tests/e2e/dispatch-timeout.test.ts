/**
 * Fluxo de oferta em tempo real contra PostgreSQL real (§16).
 *
 * Foco nas regras do modelo Uber: recusa explícita rotaciona a fila na hora;
 * o timeout do lock de negociação devolve a solicitação à fila
 * (redistribuição automática); solicitação aberta sem resposta dentro do
 * prazo expira e o dispatch encerra.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import {
  acceptDispatchAlert,
  declineDispatchAlert,
  expirarOfertasVencidas,
  startDispatchForRequest,
} from "@/server/services/dispatch-service";
import { criarCenarioBase, resetDatabase } from "./helpers";

const CID = "test-dispatch-timeout";

let cenario: Awaited<ReturnType<typeof criarCenarioBase>>;
const provedores: string[] = [];

async function criarProvedor(indice: number, cenarioBase: typeof cenario) {
  const provider = await prisma.user.create({
    data: {
      email: `tecnico${indice}@teste.local`,
      name: `Técnico ${indice}`,
      passwordHash: "x",
      role: "PROVIDER",
      providerProfile: {
        create: {
          slug: `tecnico-${indice}`,
          displayName: `Técnico ${indice}`,
          status: "APROVADO",
          verified: true,
          onboardingStep: 11,
          cityId: cenarioBase.cityId,
          baseLatitude: -23.55 - indice * 0.001,
          baseLongitude: -46.63 - indice * 0.001,
          approvedAt: new Date(),
          balance: { create: {} },
          services: {
            create: {
              categoryId: cenarioBase.categoryId,
              fromPriceCents: 15000,
            },
          },
        },
      },
    },
    include: { providerProfile: true },
  });
  provedores.push(provider.providerProfile!.id);
  return provider.providerProfile!.id;
}

async function criarSolicitacao(createdAt = new Date()) {
  return prisma.serviceRequest.create({
    data: {
      customerId: cenario.customerProfileId,
      categoryId: cenario.categoryId,
      addressId: cenario.addressId,
      equipmentType: "SPLIT",
      quantity: 1,
      description: "Ar-condicionado não gela",
      urgency: "NORMAL",
      proposedPriceCents: 18000,
      status: "ABERTA",
      createdAt,
    },
  });
}

beforeEach(async () => {
  // Reset completo: cada teste começa com banco limpo — candidatos de um
  // teste não podem vazar para o seguinte (a fila é criada por requisição).
  await resetDatabase();
  provedores.length = 0;
  cenario = await criarCenarioBase();
  for (let i = 1; i <= 4; i += 1) await criarProvedor(i, cenario);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** O candidato nº 1 da fila do dispatch da solicitação. */
async function primeiroCandidato(requestId: string) {
  return prisma.dispatchCandidate.findFirstOrThrow({
    where: { dispatch: { requestId }, status: "ALERTADO" },
    orderBy: { queuePosition: "asc" },
  });
}

describe("recusa explícita da oferta", () => {
  it("recusar rotaciona a fila na hora e alerta os próximos", async () => {
    const solicitacao = await criarSolicitacao();
    await startDispatchForRequest(solicitacao.id, CID);

    // Quem recusa é o nº 1 da fila — a ordem vem do ranking por distância,
    // não da ordem de criação dos provedores.
    const candidato = await primeiroCandidato(solicitacao.id);
    const quemRecusa = candidato.providerId;
    expect(candidato.queuePosition).toBe(1);

    await declineDispatchAlert(candidato.id, quemRecusa, CID);

    const atualizado = await prisma.dispatchCandidate.findUniqueOrThrow({
      where: { id: candidato.id },
    });
    expect(atualizado.status).toBe("RECUSADO");
    expect(atualizado.queuePosition).toBe(4); // foi para o fim da fila

    // Os demais continuam alertados, reenumerados em 1..3.
    const alertados = await prisma.dispatchCandidate.findMany({
      where: { dispatchId: candidato.dispatchId, status: "ALERTADO" },
      orderBy: { queuePosition: "asc" },
    });
    expect(alertados.map((c) => c.queuePosition)).toEqual([1, 2, 3]);
    expect(alertados.map((c) => c.providerId).sort()).toEqual(
      provedores.filter((p) => p !== quemRecusa).sort(),
    );
  });

  it("recusa de alerta indisponível é recusada", async () => {
    const solicitacao = await criarSolicitacao();
    await startDispatchForRequest(solicitacao.id, CID);

    const candidato = await prisma.dispatchCandidate.findFirstOrThrow({
      where: { dispatch: { requestId: solicitacao.id }, providerId: provedores[1] },
    });
    // Aceita com outro prestador: os demais viram PULADO.
    const aceito = await prisma.dispatchCandidate.findFirstOrThrow({
      where: { providerId: provedores[0], dispatchId: candidato.dispatchId },
    });
    await acceptDispatchAlert(aceito.id, provedores[0], CID);

    await expect(
      declineDispatchAlert(candidato.id, provedores[1], CID),
    ).rejects.toMatchObject({ code: "DISPATCH_NOT_AVAILABLE" });
  });
});

describe("timeout da oferta", () => {
  it("lock vencido devolve a solicitação à fila e alerta os próximos", async () => {
    const solicitacao = await criarSolicitacao();
    await startDispatchForRequest(solicitacao.id, CID);

    const candidato = await primeiroCandidato(solicitacao.id);
    const quemTravou = candidato.providerId;
    await acceptDispatchAlert(candidato.id, quemTravou, CID);

    // Simula o lock vencido (10 min por padrão).
    await prisma.serviceDispatch.update({
      where: { id: candidato.dispatchId },
      data: { lockExpiresAt: new Date(Date.now() - 60_000) },
    });

    const resultado = await expirarOfertasVencidas(CID, new Date());
    expect(resultado.locksLiberados).toBe(1);

    const dispatch = await prisma.serviceDispatch.findUniqueOrThrow({
      where: { id: candidato.dispatchId },
    });
    expect(dispatch.status).toBe("ATIVA");
    expect(dispatch.activeProviderId).toBeNull();

    const solicitacaoAtualizada = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: solicitacao.id },
    });
    expect(solicitacaoAtualizada.status).toBe("ABERTA");

    // Quem venceu o lock foi para o fim; os próximos foram alertados em 1..3.
    const alertados = await prisma.dispatchCandidate.findMany({
      where: { dispatchId: candidato.dispatchId, status: "ALERTADO" },
      orderBy: { queuePosition: "asc" },
    });
    expect(alertados.map((c) => c.queuePosition)).toEqual([1, 2, 3]);
    expect(alertados.map((c) => c.providerId).sort()).toEqual(
      provedores.filter((p) => p !== quemTravou).sort(),
    );
  });

  it("solicitação aberta sem resposta dentro do prazo expira", async () => {
    const ha49h = new Date(Date.now() - 49 * 3_600_000);
    const solicitacao = await criarSolicitacao(ha49h);
    await startDispatchForRequest(solicitacao.id, CID);

    const resultado = await expirarOfertasVencidas(CID, new Date());
    expect(resultado.solicitacoesExpiradas).toBe(1);

    const atualizada = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: solicitacao.id },
    });
    expect(atualizada.status).toBe("EXPIRADA");

    const dispatch = await prisma.serviceDispatch.findUniqueOrThrow({
      where: { requestId: solicitacao.id },
    });
    expect(dispatch.status).toBe("ENCERRADA");
  });
});
