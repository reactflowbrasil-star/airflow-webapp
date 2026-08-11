/**
 * Ações administrativas (§8, §33, §44).
 *
 * Duas regras que valem para tudo neste arquivo:
 *
 *   1. **Toda ação grava em `AuditLog`** com autor, alvo, valor anterior e
 *      motivo. Ação de admin sem rastro é indistinguível de invasão.
 *   2. **Toda transição passa pela máquina de estado.** Ser admin não dá o
 *      direito de levar um prestador de BLOQUEADO a APROVADO por atalho — a
 *      máquina existe justamente para que nem o operador contorne o fluxo.
 *
 * O que NÃO está aqui, de propósito: escrita no ledger. Correção de valor se
 * faz por lançamento compensatório nos serviços financeiros, nunca editando
 * histórico (§16).
 */

import { DomainError } from "@/domain/shared/errors";
import { providerMachine } from "@/domain/state-machines";
import type { Prisma, ProviderStatus, UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { emitEvent } from "@/server/events";
import { logger } from "@/server/observability/logger";
import { documentosObrigatorios } from "@/server/services/provider-onboarding-service";

interface Autor {
  /** Usuário admin autenticado. Vem da sessão, nunca do corpo da requisição. */
  userId: string;
  correlationId: string;
}

/** Motivo é obrigatório em ação administrativa — sem ele não há auditoria útil. */
function exigirMotivo(motivo: string | undefined, acao: string): string {
  const limpo = (motivo ?? "").trim();
  if (limpo.length < 3) {
    throw new DomainError(
      "REASON_REQUIRED",
      `Informe o motivo para ${acao}. Fica registrado na auditoria.`,
    );
  }
  return limpo;
}

async function registrar(
  tx: Prisma.TransactionClient,
  autor: Autor,
  dados: {
    action: string;
    entityType: string;
    entityId: string;
    previousValue?: Prisma.InputJsonValue;
    newValue?: Prisma.InputJsonValue;
    reason: string;
  },
) {
  await tx.auditLog.create({
    data: { ...dados, userId: autor.userId, correlationId: autor.correlationId },
  });
}

// ---------------------------------------------------------------------------
// Prestadores
// ---------------------------------------------------------------------------

/**
 * Aprova ou rejeita um prestador na fila de análise (§8).
 *
 * A aprovação é o que libera o profissional a receber solicitações e, mais
 * adiante, dinheiro — por isso passa pela máquina e deixa rastro de quem
 * decidiu.
 */
export async function decidirCadastroPrestador(
  providerId: string,
  decisao: "APROVADO" | "REJEITADO",
  motivo: string | undefined,
  autor: Autor,
) {
  const razao = exigirMotivo(motivo, `${decisao === "APROVADO" ? "aprovar" : "rejeitar"} o cadastro`);

  return prisma.$transaction(async (tx) => {
    const prestador = await tx.providerProfile.findUniqueOrThrow({
      where: { id: providerId },
      select: {
        id: true,
        status: true,
        displayName: true,
        userId: true,
        personType: true,
        documents: {
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, status: true },
        },
      },
    });

    providerMachine.transition(prestador.status, decisao);

    if (decisao === "APROVADO") {
      const seenTypes = new Set<typeof prestador.documents[number]["type"]>();
      const latestTypes = new Set<typeof prestador.documents[number]["type"]>();
      for (const document of prestador.documents) {
        if (seenTypes.has(document.type)) continue;
        seenTypes.add(document.type);
        if (document.status !== "REJEITADO") latestTypes.add(document.type);
      }
      const missing = documentosObrigatorios(prestador.personType).filter(
        (type) => !latestTypes.has(type),
      );
      if (missing.length > 0) {
        throw new DomainError(
          "DOCUMENTS_MISSING",
          "Cadastro não pode ser aprovado sem todos os documentos obrigatórios",
          { missing },
        );
      }
    }

    const atualizado = await tx.providerProfile.update({
      where: { id: providerId },
      data: {
        status: decisao,
        approvedAt: decisao === "APROVADO" ? new Date() : null,
        verified: decisao === "APROVADO" ? true : undefined,
      },
    });

    await tx.providerVerification.upsert({
      where: { providerId },
      create: {
        providerId,
        status: decisao,
        reviewedAt: new Date(),
        reviewedBy: autor.userId,
        rejectionReason: decisao === "REJEITADO" ? razao : null,
      },
      update: {
        status: decisao,
        reviewedAt: new Date(),
        reviewedBy: autor.userId,
        rejectionReason: decisao === "REJEITADO" ? razao : null,
      },
    });

    await tx.providerDocument.updateMany({
      where: { providerId, status: "PENDENTE" },
      data: {
        status: decisao === "APROVADO" ? "APROVADO" : "REJEITADO",
        reviewedAt: new Date(),
        reviewedBy: autor.userId,
        rejectionReason: decisao === "REJEITADO" ? razao : null,
      },
    });

    await registrar(tx, autor, {
      action: decisao === "APROVADO" ? "PROVIDER_APPROVED" : "PROVIDER_REJECTED",
      entityType: "ProviderProfile",
      entityId: providerId,
      previousValue: { status: prestador.status },
      newValue: { status: decisao },
      reason: razao,
    });

    await tx.notification.create({
      data: {
        userId: prestador.userId,
        type: decisao === "APROVADO" ? "CADASTRO_APROVADO" : "CADASTRO_REJEITADO",
        title:
          decisao === "APROVADO"
            ? "Cadastro aprovado"
            : "Cadastro não aprovado",
        body:
          decisao === "APROVADO"
            ? "Seu perfil está ativo e já aparece nas buscas."
            : `Revisão necessária: ${razao}`,
        linkUrl: "/pro/perfil",
      },
    });

    logger.info("Cadastro de prestador decidido", {
      correlationId: autor.correlationId,
      providerId,
      de: prestador.status,
      para: decisao,
    });

    return atualizado;
  });
}

/** Suspende ou reativa um prestador já aprovado (§8). */
export async function alterarStatusPrestador(
  providerId: string,
  novoStatus: ProviderStatus,
  motivo: string | undefined,
  autor: Autor,
) {
  const razao = exigirMotivo(motivo, "alterar o status do prestador");

  return prisma.$transaction(async (tx) => {
    const prestador = await tx.providerProfile.findUniqueOrThrow({
      where: { id: providerId },
      select: { status: true, userId: true },
    });

    providerMachine.transition(prestador.status, novoStatus);

    const atualizado = await tx.providerProfile.update({
      where: { id: providerId },
      data: { status: novoStatus },
    });

    await registrar(tx, autor, {
      action: "PROVIDER_STATUS_CHANGED",
      entityType: "ProviderProfile",
      entityId: providerId,
      previousValue: { status: prestador.status },
      newValue: { status: novoStatus },
      reason: razao,
    });

    logger.info("Status de prestador alterado", {
      correlationId: autor.correlationId,
      providerId,
      de: prestador.status,
      para: novoStatus,
    });

    return atualizado;
  });
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

/**
 * Suspende, bloqueia ou reativa uma conta.
 *
 * Um admin não pode suspender a si mesmo: seria a forma mais fácil de deixar a
 * plataforma sem operador.
 */
export async function alterarStatusUsuario(
  userId: string,
  novoStatus: UserStatus,
  motivo: string | undefined,
  autor: Autor,
) {
  const razao = exigirMotivo(motivo, "alterar o status da conta");

  if (userId === autor.userId) {
    throw new DomainError(
      "CANNOT_CHANGE_OWN_STATUS",
      "Você não pode alterar o status da própria conta",
    );
  }

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, role: true, email: true },
    });

    const atualizado = await tx.user.update({
      where: { id: userId },
      data: { status: novoStatus },
    });

    await registrar(tx, autor, {
      action: "USER_STATUS_CHANGED",
      entityType: "User",
      entityId: userId,
      previousValue: { status: usuario.status },
      newValue: { status: novoStatus },
      reason: razao,
    });

    logger.warn("Status de conta alterado por admin", {
      correlationId: autor.correlationId,
      userId,
      de: usuario.status,
      para: novoStatus,
    });

    return atualizado;
  });
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/**
 * Liga/desliga uma categoria. Desativar não apaga: solicitações antigas
 * continuam apontando para ela, e histórico não se reescreve.
 */
export async function alternarCategoria(
  categoryId: string,
  ativa: boolean,
  autor: Autor,
) {
  return prisma.$transaction(async (tx) => {
    const categoria = await tx.serviceCategory.findUniqueOrThrow({
      where: { id: categoryId },
      select: { active: true, name: true },
    });

    const atualizada = await tx.serviceCategory.update({
      where: { id: categoryId },
      data: { active: ativa },
    });

    await registrar(tx, autor, {
      action: "CATEGORY_TOGGLED",
      entityType: "ServiceCategory",
      entityId: categoryId,
      previousValue: { active: categoria.active },
      newValue: { active: ativa },
      reason: `${ativa ? "Ativada" : "Desativada"} pelo painel`,
    });

    return atualizada;
  });
}

/** Liga/desliga uma cidade atendida. */
export async function alternarCidade(cityId: string, ativa: boolean, autor: Autor) {
  return prisma.$transaction(async (tx) => {
    const cidade = await tx.city.findUniqueOrThrow({
      where: { id: cityId },
      select: { active: true },
    });

    const atualizada = await tx.city.update({
      where: { id: cityId },
      data: { active: ativa },
    });

    await registrar(tx, autor, {
      action: "CITY_TOGGLED",
      entityType: "City",
      entityId: cityId,
      previousValue: { active: cidade.active },
      newValue: { active: ativa },
      reason: `${ativa ? "Ativada" : "Desativada"} pelo painel`,
    });

    return atualizada;
  });
}

// ---------------------------------------------------------------------------
// Fila de eventos do n8n
// ---------------------------------------------------------------------------

/**
 * Reenfileira um evento que foi para DEAD_LETTER.
 *
 * Não reescreve o evento nem o payload: só zera as tentativas e reagenda. O
 * consumidor no n8n é idempotente por `idempotencyKey`, então reenviar um
 * evento que na verdade chegou não duplica efeito.
 */
export async function reenfileirarEvento(eventId: string, autor: Autor) {
  return prisma.$transaction(async (tx) => {
    const evento = await tx.outboundEvent.findUniqueOrThrow({
      where: { id: eventId },
      select: { id: true, status: true, eventType: true, attempts: true },
    });

    if (evento.status !== "DEAD_LETTER") {
      throw new DomainError(
        "EVENT_NOT_DEAD_LETTER",
        `Evento em ${evento.status} não precisa de reenfileiramento`,
      );
    }

    const atualizado = await tx.outboundEvent.update({
      where: { id: eventId },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null,
      },
    });

    await registrar(tx, autor, {
      action: "EVENT_REQUEUED",
      entityType: "OutboundEvent",
      entityId: eventId,
      previousValue: { status: "DEAD_LETTER", attempts: evento.attempts },
      newValue: { status: "PENDING" },
      reason: "Reenfileirado manualmente pelo painel",
    });

    logger.info("Evento reenfileirado", {
      correlationId: autor.correlationId,
      eventId,
      eventType: evento.eventType,
    });

    return atualizado;
  });
}

// ---------------------------------------------------------------------------
// Regras de comissão
// ---------------------------------------------------------------------------

/**
 * Desativa uma regra de comissão.
 *
 * Nunca edita a regra no lugar: snapshots já congelados apontam para ela e
 * precisam continuar legíveis (§19). Alterar comissão é criar versão nova.
 */
export async function desativarRegraComissao(ruleId: string, autor: Autor) {
  return prisma.$transaction(async (tx) => {
    const regra = await tx.commissionRule.findUniqueOrThrow({
      where: { id: ruleId },
      select: { active: true, name: true, version: true },
    });

    if (!regra.active) {
      throw new DomainError("RULE_ALREADY_INACTIVE", "Esta regra já está inativa");
    }

    const atualizada = await tx.commissionRule.update({
      where: { id: ruleId },
      data: { active: false, validTo: new Date() },
    });

    await registrar(tx, autor, {
      action: "COMMISSION_RULE_DEACTIVATED",
      entityType: "CommissionRule",
      entityId: ruleId,
      previousValue: { active: true },
      newValue: { active: false },
      reason: `Regra "${regra.name}" v${regra.version} desativada pelo painel`,
    });

    await emitEvent(tx, {
      type: "commission.rule_changed",
      idempotencyKey: `commission.rule_deactivated:${ruleId}`,
      correlationId: autor.correlationId,
      data: { rule_id: ruleId, active: false },
    });

    return atualizada;
  });
}
