/**
 * Estúdio de marketing contra PostgreSQL real, com a Higgsfield substituída
 * por um cliente falso: o que se prova aqui é o que é NOSSO — posse (404),
 * idempotência sob concorrência, envio incerto nunca reenviado, máquina de
 * estado no poll e cancelamento que chega à API.
 */

import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { MODELO_SEEDANCE_25, MODELO_SUNBURST } from "@/domain/estudio/catalogo";
import { DomainError } from "@/domain/shared/errors";
import { prisma } from "@/server/db/prisma";
import { ErroHiggsfield, type ClienteHiggsfield, type StatusRemoto } from "@/server/higgsfield/cliente";
import {
  atualizarGeracao,
  cancelarGeracao,
  enviarGeracao,
  registrarAuditoriaChave,
} from "@/server/services/estudio-service";

import { resetDatabase } from "./helpers";

const CID = "cid-estudio";

function clienteFalso(parcial: Partial<ClienteHiggsfield> = {}) {
  const cliente = {
    enviar: vi.fn(async () => ({ requestId: `req-${randomUUID()}`, status: "queued" })),
    consultar: vi.fn(
      async (requestId: string): Promise<StatusRemoto> => ({ requestId, status: "queued", urls: [], erro: null }),
    ),
    cancelar: vi.fn(async () => undefined),
    criarUpload: vi.fn(),
    listarPresets: vi.fn(),
    ...parcial,
  };
  return cliente as typeof cliente & ClienteHiggsfield;
}

function remoto(status: string, extra: Partial<StatusRemoto> = {}) {
  return async (requestId: string): Promise<StatusRemoto> => ({
    requestId,
    status,
    urls: [],
    erro: null,
    ...extra,
  });
}

async function criarAdmin(email: string) {
  return prisma.user.create({
    data: { email, name: "Admin Estúdio", passwordHash: "x", role: "ADMIN" },
  });
}

let adminId: string;
let outroAdminId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await criarAdmin("admin@estudio.local")).id;
  outroAdminId = (await criarAdmin("outro@estudio.local")).id;
});

async function gerarNaFila(cliente = clienteFalso()) {
  const { geracao } = await enviarGeracao({
    userId: adminId,
    idempotencyKey: randomUUID(),
    modelo: MODELO_SUNBURST,
    entrada: { prompt: "Técnico instalando split" },
    cliente,
    correlationId: CID,
  });
  return geracao;
}

describe("envio", () => {
  it("grava o request_id com o dono e manda o corpo validado com os defaults", async () => {
    const cliente = clienteFalso({
      enviar: vi.fn(async () => ({ requestId: "req-aceito", status: "queued" })),
    });
    const { geracao, repetida, tipoFalha } = await enviarGeracao({
      userId: adminId,
      idempotencyKey: randomUUID(),
      modelo: MODELO_SUNBURST,
      entrada: { prompt: "  Técnico sorrindo ao lado do split  ", aspect_ratio: "16:9" },
      cliente,
      correlationId: CID,
    });

    expect(repetida).toBe(false);
    expect(tipoFalha).toBeNull();
    expect(geracao).toMatchObject({ status: "NA_FILA", superficie: "IMAGEM", podeCancelar: true, terminal: false });
    expect(cliente.enviar).toHaveBeenCalledExactlyOnceWith(MODELO_SUNBURST, {
      prompt: "Técnico sorrindo ao lado do split",
      quality: "high",
      resolution: "2k",
      aspect_ratio: "16:9",
      moderation: "auto",
      enhance_prompt: false,
    });
    const linha = await prisma.mediaGeneration.findUniqueOrThrow({ where: { id: geracao.id } });
    expect(linha).toMatchObject({ userId: adminId, requestId: "req-aceito", status: "NA_FILA" });
  });

  it("a mesma chave de idempotência nunca vira um segundo POST — nem em paralelo", async () => {
    const cliente = clienteFalso();
    const chave = randomUUID();
    const pedido = () =>
      enviarGeracao({
        userId: adminId,
        idempotencyKey: chave,
        modelo: MODELO_SEEDANCE_25,
        entrada: { prompt: "A cinematic scene at sunset", duration: 5, resolution: "720p", aspect_ratio: "16:9" },
        cliente,
        correlationId: CID,
      });

    const [a, b] = await Promise.all([pedido(), pedido()]);
    const c = await pedido();

    expect(cliente.enviar).toHaveBeenCalledTimes(1);
    expect(new Set([a.geracao.id, b.geracao.id, c.geracao.id]).size).toBe(1);
    expect([a.repetida, b.repetida].sort()).toEqual([false, true]);
    expect(c.repetida).toBe(true);
    expect(await prisma.mediaGeneration.count()).toBe(1);
  });

  it("a chave de idempotência é por usuário", async () => {
    const cliente = clienteFalso();
    const chave = randomUUID();
    for (const userId of [adminId, outroAdminId]) {
      await enviarGeracao({
        userId,
        idempotencyKey: chave,
        modelo: MODELO_SUNBURST,
        entrada: { prompt: "x" },
        cliente,
        correlationId: CID,
      });
    }
    expect(cliente.enviar).toHaveBeenCalledTimes(2);
  });

  it("entrada inválida não cria linha nem chama a API", async () => {
    const cliente = clienteFalso();
    await expect(
      enviarGeracao({
        userId: adminId,
        idempotencyKey: randomUUID(),
        modelo: MODELO_SEEDANCE_25,
        entrada: { prompt: "x", resolution: "1080p" },
        cliente,
        correlationId: CID,
      }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      enviarGeracao({
        userId: adminId,
        idempotencyKey: randomUUID(),
        modelo: "modelo/inventado",
        entrada: { prompt: "x" },
        cliente,
        correlationId: CID,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(cliente.enviar).not.toHaveBeenCalled();
    expect(await prisma.mediaGeneration.count()).toBe(0);
  });

  it("recusa definitiva vira RECUSADA com o motivo — e não é reenviada", async () => {
    const cliente = clienteFalso({
      enviar: vi.fn(async () => {
        throw new ErroHiggsfield("CHAVE_RECUSADA", "A Higgsfield recusou a chave de API.", 401);
      }),
    });
    const { geracao, tipoFalha } = await enviarGeracao({
      userId: adminId,
      idempotencyKey: randomUUID(),
      modelo: MODELO_SUNBURST,
      entrada: { prompt: "x" },
      cliente,
      correlationId: CID,
    });
    expect(geracao).toMatchObject({ status: "RECUSADA", terminal: true, erro: "A Higgsfield recusou a chave de API." });
    expect(tipoFalha).toBe("CHAVE_RECUSADA");
    expect(cliente.enviar).toHaveBeenCalledTimes(1);
  });

  it("sem resposta vira INDETERMINADA, avisa para conferir e nunca reenvia", async () => {
    const cliente = clienteFalso({
      enviar: vi.fn(async () => {
        throw new ErroHiggsfield("SEM_RESPOSTA", "A Higgsfield não respondeu a tempo.");
      }),
    });
    const { geracao } = await enviarGeracao({
      userId: adminId,
      idempotencyKey: randomUUID(),
      modelo: MODELO_SUNBURST,
      entrada: { prompt: "x" },
      cliente,
      correlationId: CID,
    });
    expect(geracao.status).toBe("INDETERMINADA");
    expect(geracao.erro).toContain("open.higgsfield.ai");

    const depois = await atualizarGeracao({ userId: adminId, geracaoId: geracao.id, cliente, correlationId: CID });
    expect(depois?.status).toBe("INDETERMINADA");
    expect(cliente.enviar).toHaveBeenCalledTimes(1);
    expect(cliente.consultar).not.toHaveBeenCalled();
  });
});

describe("posse", () => {
  it("geração de outro admin não existe para quem pergunta", async () => {
    const cliente = clienteFalso();
    const geracao = await gerarNaFila(cliente);

    expect(
      await atualizarGeracao({ userId: outroAdminId, geracaoId: geracao.id, cliente, correlationId: CID }),
    ).toBeNull();
    expect(
      await cancelarGeracao({ userId: outroAdminId, geracaoId: geracao.id, cliente, correlationId: CID }),
    ).toBeNull();
    expect(cliente.consultar).not.toHaveBeenCalled();
    expect(cliente.cancelar).not.toHaveBeenCalled();
  });
});

describe("poll", () => {
  it("completed grava URLs e conclusão; failed e nsfw guardam o motivo", async () => {
    const concluida = await gerarNaFila();
    const falhou = await gerarNaFila();
    const bloqueada = await gerarNaFila();

    const ok = await atualizarGeracao({
      userId: adminId,
      geracaoId: concluida.id,
      cliente: clienteFalso({ consultar: vi.fn(remoto("completed", { urls: ["https://cdn.higgsfield.ai/a.png"] })) }),
      correlationId: CID,
    });
    expect(ok).toMatchObject({ status: "CONCLUIDA", urls: ["https://cdn.higgsfield.ai/a.png"], terminal: true, erro: null });
    expect(ok?.concluidaEm).not.toBeNull();

    const erro = await atualizarGeracao({
      userId: adminId,
      geracaoId: falhou.id,
      cliente: clienteFalso({ consultar: vi.fn(remoto("failed", { erro: "Upstream model error" })) }),
      correlationId: CID,
    });
    expect(erro).toMatchObject({ status: "FALHOU", terminal: true });
    expect(erro?.erro).toContain("Upstream model error");

    const nsfw = await atualizarGeracao({
      userId: adminId,
      geracaoId: bloqueada.id,
      cliente: clienteFalso({ consultar: vi.fn(remoto("nsfw")) }),
      correlationId: CID,
    });
    expect(nsfw).toMatchObject({ status: "BLOQUEADA", terminal: true });
  });

  it("estado final não consulta mais; poll atrasado não retrocede", async () => {
    const geracao = await gerarNaFila();
    const emAndamento = clienteFalso({ consultar: vi.fn(remoto("in_progress")) });
    expect(
      (await atualizarGeracao({ userId: adminId, geracaoId: geracao.id, cliente: emAndamento, correlationId: CID }))?.status,
    ).toBe("PROCESSANDO");

    const atrasado = clienteFalso({ consultar: vi.fn(remoto("queued")) });
    expect(
      (await atualizarGeracao({ userId: adminId, geracaoId: geracao.id, cliente: atrasado, correlationId: CID }))?.status,
    ).toBe("PROCESSANDO");

    const fim = clienteFalso({ consultar: vi.fn(remoto("completed", { urls: ["https://cdn.higgsfield.ai/v.mp4"] })) });
    await atualizarGeracao({ userId: adminId, geracaoId: geracao.id, cliente: fim, correlationId: CID });
    await atualizarGeracao({ userId: adminId, geracaoId: geracao.id, cliente: fim, correlationId: CID });
    expect(fim.consultar).toHaveBeenCalledTimes(1);
  });

  it("sem chave devolve o último estado conhecido sem chamar a API", async () => {
    const geracao = await gerarNaFila();
    const resultado = await atualizarGeracao({ userId: adminId, geracaoId: geracao.id, cliente: null, correlationId: CID });
    expect(resultado?.status).toBe("NA_FILA");
  });

  it("envio que ficou preso em ENVIANDO vira INDETERMINADA, sem reenvio", async () => {
    const linha = await prisma.mediaGeneration.create({
      data: {
        userId: adminId,
        idempotencyKey: randomUUID(),
        model: MODELO_SUNBURST,
        surface: "IMAGEM",
        prompt: "x",
        input: { prompt: "x" },
        status: "ENVIANDO",
        createdAt: new Date(Date.now() - 5 * 60_000),
      },
    });
    const cliente = clienteFalso();
    const resultado = await atualizarGeracao({ userId: adminId, geracaoId: linha.id, cliente, correlationId: CID });
    expect(resultado?.status).toBe("INDETERMINADA");
    expect(cliente.enviar).not.toHaveBeenCalled();
  });
});

describe("cancelamento", () => {
  it("na fila: o pedido chega à API e a confirmação vem pelo status", async () => {
    const geracao = await gerarNaFila();
    const requestId = (await prisma.mediaGeneration.findUniqueOrThrow({ where: { id: geracao.id } })).requestId;
    const cliente = clienteFalso({ consultar: vi.fn(remoto("canceled")) });

    const cancelada = await cancelarGeracao({ userId: adminId, geracaoId: geracao.id, cliente, correlationId: CID });

    expect(cliente.cancelar).toHaveBeenCalledExactlyOnceWith(requestId);
    expect(cancelada).toMatchObject({ status: "CANCELADA", terminal: true, podeCancelar: false });
  });

  it("depois que começou, recusa sem chamar a API", async () => {
    const geracao = await gerarNaFila();
    await atualizarGeracao({
      userId: adminId,
      geracaoId: geracao.id,
      cliente: clienteFalso({ consultar: vi.fn(remoto("in_progress")) }),
      correlationId: CID,
    });
    const cliente = clienteFalso();
    await expect(
      cancelarGeracao({ userId: adminId, geracaoId: geracao.id, cliente, correlationId: CID }),
    ).rejects.toMatchObject({ code: "CANCELAMENTO_INDISPONIVEL" });
    expect(cliente.cancelar).not.toHaveBeenCalled();
  });
});

describe("auditoria da chave", () => {
  it("registra conectar e remover sem valor nenhum da chave", async () => {
    await registrarAuditoriaChave(adminId, "HIGGSFIELD_CHAVE_CONECTADA", CID);
    await registrarAuditoriaChave(adminId, "HIGGSFIELD_CHAVE_REMOVIDA", CID);
    const registros = await prisma.auditLog.findMany({ where: { userId: adminId }, orderBy: { createdAt: "asc" } });
    expect(registros.map((r) => r.action)).toEqual(["HIGGSFIELD_CHAVE_CONECTADA", "HIGGSFIELD_CHAVE_REMOVIDA"]);
    expect(registros.every((r) => r.newValue === null && r.previousValue === null)).toBe(true);
  });
});
