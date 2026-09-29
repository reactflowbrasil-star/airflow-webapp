/**
 * Estúdio de marketing — imagens de campanha geradas pelo operador (admin).
 *
 * Três regras:
 *
 *   1. **Toda geração deixa rastro.** Cada pedido gasta crédito da conta
 *      Higgsfield da plataforma: o `AuditLog` registra quem pediu, o quê e
 *      com quais parâmetros — e, quando o provedor encerra, o desfecho.
 *   2. **Só se acompanha geração que nasceu aqui.** O id chega pela URL; sem o
 *      registro do pedido na auditoria a resposta é 404. Sem isso o painel
 *      viraria um proxy da chave para consultar qualquer requisição da conta.
 *   3. **Sem migration.** O histórico do estúdio é a própria trilha de
 *      auditoria: pedido e desfecho ligados pelo `entityId` (o id da requisição
 *      no provedor). Tabela própria só se justifica quando houver cota por
 *      usuário ou geração fora do admin.
 */

import { z } from "zod";

import { DomainError } from "@/domain/shared/errors";
import type { Prisma } from "@/generated/prisma/client";
import {
  STATUS_GERACAO,
  geracaoTerminou,
  linkDeImagemExibivel,
  type GeracaoImagem,
  type PaginaPresets,
  type StatusGeracao,
} from "@/lib/marketing-image";
import type { PedidoImagemMarketing } from "@/lib/validation/marketing";
import { prisma } from "@/server/db/prisma";
import { getImagemMarketingProvider, type ImagemMarketingProvider } from "@/server/marketing";
import { logger } from "@/server/observability/logger";

const ENTIDADE = "MarketingImage";

export const ACOES_ESTUDIO = {
  pedido: "MARKETING_IMAGE_REQUESTED",
  concluida: "MARKETING_IMAGE_COMPLETED",
  naoConcluida: "MARKETING_IMAGE_FAILED",
} as const;

const ACOES_DE_DESFECHO = [ACOES_ESTUDIO.concluida, ACOES_ESTUDIO.naoConcluida];

interface Autor {
  /** Admin autenticado. Vem da sessão, nunca do corpo da requisição. */
  userId: string;
  correlationId: string;
}

function resumoDoPedido(
  pedido: PedidoImagemMarketing,
  provedor: ImagemMarketingProvider,
): Prisma.InputJsonObject {
  return {
    provedor: provedor.id,
    modo: provedor.modo,
    modelo: provedor.modelo,
    prompt: pedido.prompt,
    qualidade: pedido.qualidade,
    resolucao: pedido.resolucao,
    proporcao: pedido.proporcao,
    aprimorar: pedido.aprimorar,
    presetId: pedido.presetId ?? null,
    referencias: pedido.imagens.length,
    // Só o host: link assinado (S3, CDN) leva credencial na query string, e a
    // auditoria é lida por qualquer admin.
    hostsDasReferencias: [...new Set(pedido.imagens.map((url) => new URL(url).host))],
  };
}

/**
 * Enfileira uma geração e registra o pedido.
 *
 * O provedor é chamado antes da auditoria porque o `entityId` é o id que ele
 * devolve. Se o banco falhar depois do aceite, a geração segue no provedor
 * sem registro aqui — o operador vê o erro e a conta Higgsfield mantém o
 * próprio histórico. Inverter a ordem exigiria um registro sem id.
 */
export async function solicitarImagemMarketing(
  pedido: PedidoImagemMarketing,
  autor: Autor,
): Promise<GeracaoImagem> {
  const provedor = getImagemMarketingProvider();
  const geracao = await provedor.gerar(pedido, autor.correlationId);

  await prisma.auditLog.create({
    data: {
      userId: autor.userId,
      correlationId: autor.correlationId,
      action: ACOES_ESTUDIO.pedido,
      entityType: ENTIDADE,
      entityId: geracao.requestId,
      newValue: resumoDoPedido(pedido, provedor),
      reason: "Geração de imagem no estúdio de marketing",
    },
  });

  // Recusa imediata (moderação, por exemplo) já chega terminada.
  if (geracaoTerminou(geracao.status)) await registrarDesfecho(geracao, autor);
  return geracao;
}

/**
 * Acompanha uma geração. `null` quando o id não nasceu neste painel — a rota
 * responde 404.
 */
export async function consultarImagemMarketing(
  requestId: string,
  autor: Autor,
): Promise<GeracaoImagem | null> {
  const pedido = await prisma.auditLog.findFirst({
    where: { entityType: ENTIDADE, entityId: requestId, action: ACOES_ESTUDIO.pedido },
    select: { newValue: true },
  });
  if (!pedido) return null;

  const provedor = getImagemMarketingProvider();
  // Pedido feito no sandbox não existe no Higgsfield, e o sandbox "concluiria"
  // um pedido real com a prévia falsa — gravando desfecho mentiroso.
  const provedorDoPedido = lerPedidoAuditado(pedido.newValue).provedor;
  if (provedorDoPedido && provedorDoPedido !== provedor.id) {
    throw new DomainError(
      "MARKETING_PROVEDOR_TROCADO",
      `Esta geração foi pedida com o provedor "${provedorDoPedido}" e o servidor agora usa ` +
        `"${provedor.id}". Ela não pode ser acompanhada daqui.`,
    );
  }

  const geracao = await provedor.consultar(requestId, autor.correlationId);
  if (geracaoTerminou(geracao.status)) await registrarDesfecho(geracao, autor);
  return geracao;
}

/**
 * Grava o desfecho uma vez só. O polling do painel é sequencial, então duas
 * escritas para o mesmo id são improváveis; se acontecerem, o estado terminal
 * do provedor não muda — viram linhas idênticas, e o histórico usa a primeira.
 */
async function registrarDesfecho(geracao: GeracaoImagem, autor: Autor): Promise<void> {
  const jaRegistrado = await prisma.auditLog.findFirst({
    where: {
      entityType: ENTIDADE,
      entityId: geracao.requestId,
      action: { in: ACOES_DE_DESFECHO },
    },
    select: { id: true },
  });
  if (jaRegistrado) return;

  await prisma.auditLog.create({
    data: {
      userId: autor.userId,
      correlationId: autor.correlationId,
      action:
        geracao.status === "CONCLUIDA" ? ACOES_ESTUDIO.concluida : ACOES_ESTUDIO.naoConcluida,
      entityType: ENTIDADE,
      entityId: geracao.requestId,
      newValue: { status: geracao.status, imagens: geracao.imagens, erro: geracao.erro ?? null },
      reason: "Desfecho informado pelo provedor",
    },
  });

  logger.info("Geração do estúdio de marketing encerrada", {
    correlationId: autor.correlationId,
    requestId: geracao.requestId,
    status: geracao.status,
  });
}

export async function listarPresetsMarketing(
  cursor: string | undefined,
  correlationId: string,
): Promise<PaginaPresets> {
  return getImagemMarketingProvider().listarPresets(cursor, correlationId);
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

/**
 * JSON de auditoria é dado, não contrato: cada campo tem valor de reserva, e
 * uma linha antiga ou torta aparece incompleta em vez de derrubar a página.
 */
const pedidoAuditadoSchema = z.object({
  provedor: z.string().catch(""),
  modo: z.enum(["sandbox", "real"]).catch("sandbox"),
  prompt: z.string().catch(""),
  proporcao: z.string().catch("auto"),
  qualidade: z.string().catch("high"),
  resolucao: z.string().catch("2k"),
  aprimorar: z.boolean().catch(false),
});

const desfechoAuditadoSchema = z.object({
  status: z.enum(STATUS_GERACAO).catch("FALHOU"),
  imagens: z.array(z.string()).catch([]),
  erro: z.string().nullable().catch(null),
});

function lerPedidoAuditado(valor: Prisma.JsonValue | null) {
  const lido = pedidoAuditadoSchema.safeParse(valor ?? {});
  return lido.success ? lido.data : pedidoAuditadoSchema.parse({});
}

function lerDesfechoAuditado(valor: Prisma.JsonValue | null) {
  const lido = desfechoAuditadoSchema.safeParse(valor ?? {});
  return lido.success ? lido.data : desfechoAuditadoSchema.parse({});
}

export interface GeracaoRegistrada {
  requestId: string;
  criadaEm: Date;
  autorEmail: string | null;
  prompt: string;
  proporcao: string;
  qualidade: string;
  resolucao: string;
  aprimorar: boolean;
  modo: "sandbox" | "real";
  /** `null` enquanto nenhum desfecho foi registrado. */
  status: StatusGeracao | null;
  imagens: string[];
  erro: string | null;
}

export async function listarGeracoesRecentes(limite = 12): Promise<GeracaoRegistrada[]> {
  const pedidos = await prisma.auditLog.findMany({
    where: { entityType: ENTIDADE, action: ACOES_ESTUDIO.pedido },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      entityId: true,
      createdAt: true,
      newValue: true,
      user: { select: { email: true } },
    },
  });
  if (pedidos.length === 0) return [];

  const desfechos = await prisma.auditLog.findMany({
    where: {
      entityType: ENTIDADE,
      action: { in: ACOES_DE_DESFECHO },
      entityId: { in: pedidos.map((p) => p.entityId) },
    },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, newValue: true },
  });
  const primeiroDesfecho = new Map<string, Prisma.JsonValue | null>();
  for (const desfecho of desfechos) {
    if (!primeiroDesfecho.has(desfecho.entityId)) {
      primeiroDesfecho.set(desfecho.entityId, desfecho.newValue);
    }
  }

  return pedidos.map((registro) => {
    const pedido = lerPedidoAuditado(registro.newValue);
    const desfecho = primeiroDesfecho.has(registro.entityId)
      ? lerDesfechoAuditado(primeiroDesfecho.get(registro.entityId) ?? null)
      : null;
    return {
      requestId: registro.entityId,
      criadaEm: registro.createdAt,
      autorEmail: registro.user?.email ?? null,
      prompt: pedido.prompt,
      proporcao: pedido.proporcao,
      qualidade: pedido.qualidade,
      resolucao: pedido.resolucao,
      aprimorar: pedido.aprimorar,
      modo: pedido.modo,
      status: desfecho?.status ?? null,
      imagens: (desfecho?.imagens ?? []).filter(linkDeImagemExibivel),
      erro: desfecho?.erro ?? null,
    };
  });
}
