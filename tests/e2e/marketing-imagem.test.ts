/**
 * Estúdio de marketing contra PostgreSQL real (§44).
 *
 * O que estes testes protegem: toda geração deixa rastro na auditoria; só se
 * acompanha geração que nasceu no painel (a chave da plataforma não vira
 * consulta aberta à conta); o desfecho é gravado uma vez; e link assinado de
 * imagem de referência não vaza para a trilha.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pedidoImagemMarketingSchema } from "@/lib/validation/marketing";
import { prisma } from "@/server/db/prisma";
import { resetImagemMarketingProvider } from "@/server/marketing";
import {
  ACOES_ESTUDIO,
  consultarImagemMarketing,
  listarGeracoesRecentes,
  solicitarImagemMarketing,
} from "@/server/services/marketing-image-service";
import { resetDatabase } from "./helpers";

const CID = "test-estudio";
const ID_ALHEIO = "3f9c2a1e-8b4d-4c6e-9a2f-1d7e5b3c9a01";

let autor: { userId: string; correlationId: string };

function pedido(entrada: Record<string, unknown> = {}) {
  return pedidoImagemMarketingSchema.parse({ prompt: "Técnico instalando split", ...entrada });
}

beforeEach(async () => {
  await resetDatabase();
  // Sandbox garantido, mesmo que o shell de quem roda tenha uma HF_KEY real.
  vi.stubEnv("HF_KEY", "");
  vi.stubEnv("HF_CREDENTIALS", "");
  resetImagemMarketingProvider();

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

afterEach(() => {
  vi.unstubAllEnvs();
  resetImagemMarketingProvider();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("pedido", () => {
  it("registra quem pediu, o quê e com quais parâmetros", async () => {
    const geracao = await solicitarImagemMarketing(pedido({ proporcao: "16:9" }), autor);
    expect(geracao.status).toBe("NA_FILA");

    const registros = await prisma.auditLog.findMany({ where: { entityId: geracao.requestId } });
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      action: ACOES_ESTUDIO.pedido,
      entityType: "MarketingImage",
      userId: autor.userId,
      correlationId: CID,
    });
    expect(registros[0].newValue).toMatchObject({
      provedor: "sandbox",
      modo: "sandbox",
      prompt: "Técnico instalando split",
      proporcao: "16:9",
      qualidade: "high",
      resolucao: "2k",
      aprimorar: false,
      presetId: null,
      referencias: 0,
    });
  });

  it("link assinado de referência não vaza para a auditoria — só o host", async () => {
    const geracao = await solicitarImagemMarketing(
      pedido({
        imagens: [
          "https://bucket.s3.amazonaws.com/foto.png?X-Amz-Signature=assinatura-secreta",
          "https://bucket.s3.amazonaws.com/outra.png?X-Amz-Signature=outra-assinatura",
        ],
      }),
      autor,
    );

    const registro = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: geracao.requestId },
    });
    expect(JSON.stringify(registro)).not.toContain("assinatura");
    expect(registro.newValue).toMatchObject({
      referencias: 2,
      hostsDasReferencias: ["bucket.s3.amazonaws.com"],
    });
  });
});

describe("acompanhamento", () => {
  it("geração que não nasceu no painel é tratada como inexistente", async () => {
    expect(await consultarImagemMarketing(ID_ALHEIO, autor)).toBeNull();
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("desfecho é gravado uma vez, mesmo com consultas repetidas", async () => {
    const { requestId } = await solicitarImagemMarketing(pedido(), autor);

    const primeira = await consultarImagemMarketing(requestId, autor);
    const segunda = await consultarImagemMarketing(requestId, autor);
    expect(primeira?.status).toBe("CONCLUIDA");
    expect(segunda?.status).toBe("CONCLUIDA");

    const desfechos = await prisma.auditLog.findMany({
      where: { entityId: requestId, action: ACOES_ESTUDIO.concluida },
    });
    expect(desfechos).toHaveLength(1);
    expect(desfechos[0].newValue).toMatchObject({ status: "CONCLUIDA", erro: null });
  });

  it("pedido feito no sandbox não é acompanhado depois que o servidor passa a usar o Higgsfield", async () => {
    const { requestId } = await solicitarImagemMarketing(pedido(), autor);

    vi.stubEnv("HF_KEY", "id-de-teste:segredo-de-teste");
    resetImagemMarketingProvider();

    // Recusa antes de qualquer chamada de rede: o id nem existe no Higgsfield,
    // e gravar desfecho aqui seria mentir no histórico.
    await expect(consultarImagemMarketing(requestId, autor)).rejects.toMatchObject({
      code: "MARKETING_PROVEDOR_TROCADO",
    });
    expect(await prisma.auditLog.count({ where: { entityId: requestId } })).toBe(1);
  });
});

describe("histórico", () => {
  it("liga pedido e desfecho, do mais recente para o mais antigo", async () => {
    const antiga = await solicitarImagemMarketing(pedido({ prompt: "Primeira" }), autor);
    await consultarImagemMarketing(antiga.requestId, autor);
    // createdAt tem precisão de milissegundo: sem folga, os dois pedidos
    // podiam empatar e a ordem do histórico ficaria por conta do acaso.
    await new Promise((resolve) => setTimeout(resolve, 15));
    const pendente = await solicitarImagemMarketing(pedido({ prompt: "Segunda" }), autor);

    const historico = await listarGeracoesRecentes();

    expect(historico.map((g) => g.prompt)).toEqual(["Segunda", "Primeira"]);
    expect(historico[0]).toMatchObject({
      requestId: pendente.requestId,
      status: null,
      imagens: [],
      autorEmail: "admin@teste.local",
      modo: "sandbox",
    });
    expect(historico[1]).toMatchObject({ requestId: antiga.requestId, status: "CONCLUIDA" });
    expect(historico[1].imagens).toHaveLength(1);
  });

  it("JSON de auditoria torto não derruba o histórico nem vira link", async () => {
    await prisma.auditLog.create({
      data: {
        action: ACOES_ESTUDIO.pedido,
        entityType: "MarketingImage",
        entityId: ID_ALHEIO,
        newValue: ["não", "é", "objeto"],
      },
    });
    await prisma.auditLog.create({
      data: {
        action: ACOES_ESTUDIO.concluida,
        entityType: "MarketingImage",
        entityId: ID_ALHEIO,
        newValue: {
          status: "CONCLUIDA",
          imagens: ["javascript:alert(1)", "https://cdn.higgsfield.ai/ok.png"],
        },
      },
    });

    const [geracao] = await listarGeracoesRecentes();
    expect(geracao).toMatchObject({
      requestId: ID_ALHEIO,
      prompt: "",
      status: "CONCLUIDA",
      imagens: ["https://cdn.higgsfield.ai/ok.png"],
      autorEmail: null,
    });
  });
});
