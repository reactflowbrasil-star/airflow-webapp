/**
 * Ações administrativas contra PostgreSQL real (§8, §44).
 *
 * O que estes testes protegem: ser admin não é passe livre. Toda ação passa
 * pela máquina de estado, exige motivo e deixa rastro — e há coisas que nem o
 * admin pode fazer.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import {
  alterarStatusPrestador,
  alterarStatusUsuario,
  alternarCategoria,
  decidirCadastroPrestador,
  desativarRegraComissao,
  reenfileirarEvento,
} from "@/server/services/admin-service";
import { criarCenarioBase, resetDatabase, type Cenario } from "./helpers";

const CID = "test-admin";

let cenario: Cenario;
let autor: { userId: string; correlationId: string };

beforeEach(async () => {
  await resetDatabase();
  cenario = await criarCenarioBase();

  const admin = await prisma.user.create({
    data: {
      email: "admin@teste.local",
      name: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  autor = { userId: admin.id, correlationId: CID };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function prestadorEmAnalise() {
  await prisma.providerProfile.update({
    where: { id: cenario.providerProfileId },
    data: { status: "AGUARDANDO_ANALISE" },
  });
  return cenario.providerProfileId;
}

describe("aprovação de prestador", () => {
  it("aprova, marca verificado e registra quem decidiu", async () => {
    const id = await prestadorEmAnalise();

    await decidirCadastroPrestador(id, "APROVADO", "Documentos conferidos", autor);

    const p = await prisma.providerProfile.findUniqueOrThrow({ where: { id } });
    expect(p.status).toBe("APROVADO");
    expect(p.verified).toBe(true);
    expect(p.approvedAt).not.toBeNull();

    const verificacao = await prisma.providerVerification.findUniqueOrThrow({
      where: { providerId: id },
    });
    expect(verificacao.reviewedBy).toBe(autor.userId);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PROVIDER_APPROVED", entityId: id },
    });
    expect(log.userId).toBe(autor.userId);
    expect(log.reason).toBe("Documentos conferidos");
  });

  it("rejeita guardando o motivo e notifica o profissional", async () => {
    const id = await prestadorEmAnalise();

    await decidirCadastroPrestador(id, "REJEITADO", "CNH ilegível", autor);

    const verificacao = await prisma.providerVerification.findUniqueOrThrow({
      where: { providerId: id },
    });
    expect(verificacao.rejectionReason).toBe("CNH ilegível");

    const notificacao = await prisma.notification.findFirstOrThrow({
      where: { userId: cenario.providerUserId, type: "CADASTRO_REJEITADO" },
    });
    expect(notificacao.body).toContain("CNH ilegível");
  });

  it("exige motivo — ação sem motivo não é auditável", async () => {
    const id = await prestadorEmAnalise();

    await expect(
      decidirCadastroPrestador(id, "APROVADO", "", autor),
    ).rejects.toThrow(/motivo/i);
    await expect(
      decidirCadastroPrestador(id, "APROVADO", "  ", autor),
    ).rejects.toThrow(/motivo/i);

    const p = await prisma.providerProfile.findUniqueOrThrow({ where: { id } });
    expect(p.status).toBe("AGUARDANDO_ANALISE");
  });

  it("respeita a máquina de estado: BLOQUEADO não volta a APROVADO", async () => {
    await prisma.providerProfile.update({
      where: { id: cenario.providerProfileId },
      data: { status: "BLOQUEADO" },
    });

    await expect(
      alterarStatusPrestador(
        cenario.providerProfileId,
        "APROVADO",
        "tentativa indevida",
        autor,
      ),
    ).rejects.toThrow();
  });

  it("permite suspender aprovado e reativar depois", async () => {
    const id = cenario.providerProfileId;

    await alterarStatusPrestador(id, "SUSPENSO", "Reclamações recorrentes", autor);
    expect(
      (await prisma.providerProfile.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("SUSPENSO");

    await alterarStatusPrestador(id, "APROVADO", "Situação regularizada", autor);
    expect(
      (await prisma.providerProfile.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("APROVADO");
  });

  it("não deixa rastro quando a transição é recusada", async () => {
    await prisma.providerProfile.update({
      where: { id: cenario.providerProfileId },
      data: { status: "BLOQUEADO" },
    });
    const antes = await prisma.auditLog.count();

    await expect(
      alterarStatusPrestador(cenario.providerProfileId, "APROVADO", "x y z", autor),
    ).rejects.toThrow();

    // A transação inteira reverte: nem o log fica.
    expect(await prisma.auditLog.count()).toBe(antes);
  });
});

describe("status de conta", () => {
  it("suspende com motivo registrado", async () => {
    await alterarStatusUsuario(
      cenario.customerUserId,
      "SUSPENDED",
      "Fraude confirmada",
      autor,
    );

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: cenario.customerUserId },
    });
    expect(u.status).toBe("SUSPENDED");

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "USER_STATUS_CHANGED", entityId: cenario.customerUserId },
    });
    expect(log.reason).toBe("Fraude confirmada");
  });

  it("impede o admin de mexer na própria conta", async () => {
    await expect(
      alterarStatusUsuario(autor.userId, "SUSPENDED", "tentativa", autor),
    ).rejects.toThrow(/própria conta/i);
  });
});

describe("regras de comissão", () => {
  it("desativa em vez de apagar — snapshots antigos precisam da regra", async () => {
    const regra = await prisma.commissionRule.findFirstOrThrow({
      where: { scope: "GLOBAL", active: true },
    });

    await desativarRegraComissao(regra.id, autor);

    const depois = await prisma.commissionRule.findUniqueOrThrow({
      where: { id: regra.id },
    });
    expect(depois.active).toBe(false);
    expect(depois.validTo).not.toBeNull();
    // A linha continua existindo.
    expect(await prisma.commissionRule.count({ where: { id: regra.id } })).toBe(1);
  });

  it("recusa desativar duas vezes", async () => {
    const regra = await prisma.commissionRule.findFirstOrThrow({
      where: { scope: "GLOBAL", active: true },
    });
    await desativarRegraComissao(regra.id, autor);

    await expect(desativarRegraComissao(regra.id, autor)).rejects.toThrow(/inativa/i);
  });
});

describe("catálogo", () => {
  it("desativar categoria não apaga o registro", async () => {
    await alternarCategoria(cenario.categoryId, false, autor);

    const c = await prisma.serviceCategory.findUniqueOrThrow({
      where: { id: cenario.categoryId },
    });
    expect(c.active).toBe(false);
    expect(c.name).toBeTruthy();
  });
});

describe("fila de eventos", () => {
  it("reenfileira um dead-letter zerando as tentativas", async () => {
    const evento = await prisma.outboundEvent.create({
      data: {
        eventType: "payment.confirmed",
        payload: { order_id: "x" },
        idempotencyKey: "teste:1",
        status: "DEAD_LETTER",
        attempts: 5,
        lastError: "timeout",
      },
    });

    await reenfileirarEvento(evento.id, autor);

    const depois = await prisma.outboundEvent.findUniqueOrThrow({
      where: { id: evento.id },
    });
    expect(depois.status).toBe("PENDING");
    expect(depois.attempts).toBe(0);
    expect(depois.lastError).toBeNull();
    // O payload e a chave de idempotência não mudam — reenviar não duplica
    // efeito porque o consumidor deduplica por ela.
    expect(depois.idempotencyKey).toBe("teste:1");
    expect(depois.payload).toEqual({ order_id: "x" });
  });

  it("recusa reenfileirar o que não está morto", async () => {
    const evento = await prisma.outboundEvent.create({
      data: {
        eventType: "payment.confirmed",
        payload: {},
        idempotencyKey: "teste:2",
        status: "PENDING",
      },
    });

    await expect(reenfileirarEvento(evento.id, autor)).rejects.toThrow(/PENDING/);
  });
});
