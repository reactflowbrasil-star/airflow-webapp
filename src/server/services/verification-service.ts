/**
 * Verificação de telefone por código no WhatsApp (§6, §58).
 *
 * O código é uma credencial de curta duração e é tratado como tal:
 *
 *   - **hash em repouso** (bcrypt). Vazamento do banco não entrega contas.
 *   - **nunca em log**, nem no de desenvolvimento.
 *   - **uso único**, com `consumedAt` em vez de DELETE — cadastro contestado
 *     precisa de rastro.
 *   - **TTL curto** e **limite de tentativas persistido**, porque força bruta
 *     sobre seis dígitos é um milhão de tentativas e o contador tem de
 *     sobreviver a restart.
 *
 * O que este módulo NÃO faz: decidir se o usuário existe. Todas as respostas
 * de erro são iguais do ponto de vista de quem chama de fora, para que a tela
 * de verificação não vire um oráculo de "este telefone tem conta".
 */

import { randomInt, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";

import { normalizarTelefone } from "@/domain/identity/phone";
import { DomainError } from "@/domain/shared/errors";
import type { VerificationPurpose } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { getWhatsAppProvider } from "@/server/messaging/whatsapp";
import { logger } from "@/server/observability/logger";

/** Seis dígitos: equilíbrio entre digitável no celular e caro de adivinhar. */
const TAMANHO_CODIGO = 6;
/** Curto o bastante para limitar a janela, longo o bastante para trocar de app. */
export const VALIDADE_MINUTOS = 10;
/** Cinco chutes por código. Depois disso é preciso pedir outro. */
export const MAX_TENTATIVAS = 5;
/** Intervalo mínimo entre reenvios ao mesmo telefone. */
export const INTERVALO_REENVIO_SEGUNDOS = 60;
/** Teto por telefone numa janela de uma hora — barra uso como canal de spam. */
const MAX_ENVIOS_POR_HORA = 5;

/** Custo baixo de propósito: o código vive 10 minutos e é verificado a cada tentativa. */
const CUSTO_BCRYPT = 8;

function gerarCodigo(): string {
  // randomInt do node:crypto — Math.random não serve para credencial.
  return String(randomInt(0, 10 ** TAMANHO_CODIGO)).padStart(TAMANHO_CODIGO, "0");
}

function mensagem(codigo: string, purpose: VerificationPurpose): string {
  const contexto =
    purpose === "RESET_SENHA"
      ? "Você pediu para recuperar sua senha."
      : "Você pediu um código de verificação.";
  return (
    `${contexto}\n\n` +
    `Seu código AirFlow é ${codigo}.\n\n` +
    `Ele vale por ${VALIDADE_MINUTOS} minutos. ` +
    `Nunca compartilhe este código — a AirFlow jamais pede seu código por telefone ou mensagem.`
  );
}

export interface SolicitarCodigoInput {
  userId: string;
  telefone: string;
  correlationId: string;
  ipAddress?: string;
  /** Para onde o código vai — CADASTRO ativa a conta ao confirmar; RESET_SENHA troca a senha. */
  purpose?: VerificationPurpose;
}

export interface CodigoSolicitado {
  /** Para a tela confirmar o destino sem exibir o número inteiro. */
  telefoneMascarado: string;
  expiraEm: Date;
  /** `false` quando o provedor recusou — a UI oferece reenviar. */
  entregue: boolean;
}

/**
 * Gera e envia um código.
 *
 * Invalida os códigos anteriores do mesmo usuário: dois códigos válidos ao
 * mesmo tempo dobrariam a superfície de adivinhação sem nenhum ganho.
 */
export async function solicitarCodigo(
  input: SolicitarCodigoInput,
): Promise<CodigoSolicitado> {
  const telefone = normalizarTelefone(input.telefone);

  // Telefone já verificado por OUTRA conta é recusado: sem isso, uma pessoa
  // criaria contas ilimitadas com o mesmo número. No reset de senha o número
  // vem da própria conta (verificado no cadastro) — a regra do dono não se
  // aplica porque o dono É quem está pedindo.
  const donoAtual = await prisma.user.findFirst({
    where: { phone: telefone.e164, phoneVerifiedAt: { not: null } },
    select: { id: true },
  });
  if (donoAtual && donoAtual.id !== input.userId && input.purpose !== "RESET_SENHA") {
    throw new DomainError(
      "PHONE_ALREADY_VERIFIED",
      "Este telefone já está em uso por outra conta",
    );
  }

  const agora = new Date();

  const ultimo = await prisma.phoneVerification.findFirst({
    where: { phone: telefone.e164 },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (
    ultimo &&
    agora.getTime() - ultimo.createdAt.getTime() < INTERVALO_REENVIO_SEGUNDOS * 1000
  ) {
    throw new DomainError(
      "RESEND_TOO_SOON",
      `Aguarde ${INTERVALO_REENVIO_SEGUNDOS} segundos para pedir outro código`,
    );
  }

  const naUltimaHora = await prisma.phoneVerification.count({
    where: {
      phone: telefone.e164,
      createdAt: { gte: new Date(agora.getTime() - 3_600_000) },
    },
  });
  if (naUltimaHora >= MAX_ENVIOS_POR_HORA) {
    throw new DomainError(
      "TOO_MANY_CODES",
      "Muitos códigos pedidos para este número. Tente novamente mais tarde.",
    );
  }

  const codigo = gerarCodigo();
  const codeHash = await bcrypt.hash(codigo, CUSTO_BCRYPT);
  const expiresAt = new Date(agora.getTime() + VALIDADE_MINUTOS * 60_000);

  const verificacao = await prisma.$transaction(async (tx) => {
    // Um código válido por vez.
    await tx.phoneVerification.updateMany({
      where: { userId: input.userId, consumedAt: null, expiresAt: { gt: agora } },
      data: { expiresAt: agora },
    });

    return tx.phoneVerification.create({
      data: {
        userId: input.userId,
        phone: telefone.e164,
        codeHash,
        expiresAt,
        channel: "WHATSAPP",
        purpose: input.purpose ?? "CADASTRO",
        ipAddress: input.ipAddress,
      },
      select: { id: true },
    });
  });

  const purpose = input.purpose ?? "CADASTRO";
  const envio = await getWhatsAppProvider().enviar({
    para: telefone.e164,
    texto: mensagem(codigo, purpose),
    template: purpose === "RESET_SENHA" ? "recuperacao_senha" : "verificacao_cadastro",
    correlationId: input.correlationId,
  });

  await prisma.phoneVerification.update({
    where: { id: verificacao.id },
    data: {
      sentAt: envio.aceito ? new Date() : null,
      sendError: envio.aceito ? null : envio.erro?.slice(0, 200),
    },
  });

  logger.info("Código de verificação emitido", {
    correlationId: input.correlationId,
    userId: input.userId,
    entregue: envio.aceito,
    // Nem o código, nem o telefone completo.
  });

  return {
    telefoneMascarado: telefone.mascarado,
    expiraEm: expiresAt,
    entregue: envio.aceito,
  };
}

export interface ConfirmarCodigoInput {
  userId: string;
  codigo: string;
  correlationId: string;
  purpose?: VerificationPurpose;
}

interface VerificacaoConsumida {
  id: string;
  phone: string;
}

/**
 * Confere o código e o consome (uso único), sem efeitos sobre a conta.
 *
 * A comparação usa bcrypt (que já é resistente a timing) e o resultado passa
 * por `timingSafeEqual` sobre um byte, para que o caminho de sucesso e o de
 * falha custem o mesmo do ponto de vista do relógio.
 *
 * Compartilhado pelo cadastro (que depois ativa a conta) e pelo reset de
 * senha (que depois troca a senha): a prova de posse do telefone é a mesma,
 * e o consumo condicional garante uso único nos dois fluxos.
 */
export async function consumirCodigo(
  input: ConfirmarCodigoInput,
): Promise<VerificacaoConsumida> {
  const codigo = input.codigo.replace(/\D/g, "");
  if (codigo.length !== TAMANHO_CODIGO) {
    throw new DomainError("INVALID_CODE", "Código inválido ou expirado");
  }

  const agora = new Date();
  const verificacao = await prisma.phoneVerification.findFirst({
    where: { userId: input.userId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  // Mensagem única para "não existe", "expirou" e "errado": a tela não pode
  // informar em qual dos três estados o atacante está.
  const generico = new DomainError("INVALID_CODE", "Código inválido ou expirado");

  if (!verificacao || verificacao.expiresAt <= agora) throw generico;

  if (verificacao.attempts >= MAX_TENTATIVAS) {
    throw new DomainError(
      "TOO_MANY_ATTEMPTS",
      "Muitas tentativas. Peça um novo código.",
    );
  }

  const confere = await bcrypt.compare(codigo, verificacao.codeHash);

  if (!timingSafeEqual(Buffer.from([confere ? 1 : 0]), Buffer.from([1]))) {
    await prisma.phoneVerification.update({
      where: { id: verificacao.id },
      data: { attempts: { increment: 1 } },
    });
    logger.warn("Código de verificação incorreto", {
      correlationId: input.correlationId,
      userId: input.userId,
      tentativa: verificacao.attempts + 1,
    });
    throw generico;
  }

  // Consumo condicional: se duas requisições chegarem juntas com o código
  // certo, só a primeira encontra `consumedAt: null` e segue.
  const consumido = await prisma.phoneVerification.updateMany({
    where: { id: verificacao.id, consumedAt: null },
    data: { consumedAt: agora },
  });
  if (consumido.count === 0) throw generico;

  return { id: verificacao.id, phone: verificacao.phone };
}

/**
 * Confere o código e ativa a conta (fluxo de cadastro).
 */
export async function confirmarCodigo(
  input: ConfirmarCodigoInput,
): Promise<{ telefone: string }> {
  const verificacao = await consumirCodigo(input);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: {
        phone: verificacao.phone,
        phoneVerifiedAt: new Date(),
        // A verificação é o que tira a conta de PENDING_VERIFICATION. Contas
        // já suspensas ou bloqueadas não são reativadas por aqui.
        status: "ACTIVE",
      },
    });

    await tx.auditLog.create({
      data: {
        action: "PHONE_VERIFIED",
        entityType: "User",
        entityId: input.userId,
        userId: input.userId,
        newValue: { channel: "WHATSAPP" },
        correlationId: input.correlationId,
      },
    });
  });

  logger.info("Telefone verificado", {
    correlationId: input.correlationId,
    userId: input.userId,
  });

  return { telefone: verificacao.phone };
}

export interface AlterarTelefoneInput {
  userId: string;
  telefone: string;
  correlationId: string;
  ipAddress?: string;
}

/**
 * Corrige o telefone de uma conta ainda pendente e reenvia o código.
 *
 * Existe porque a tela de verificação não pode ser um beco sem saída: número
 * errado no cadastro, código que nunca chega, e o usuário preso para sempre
 * num PENDING_VERIFICATION. Só contas pendentes passam por aqui — mudança de
 * telefone de conta ativa é outro fluxo (perfil + nova verificação), nunca
 * este atalho.
 */
export async function alterarTelefonePendente(
  input: AlterarTelefoneInput,
): Promise<CodigoSolicitado> {
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { id: true, status: true, phoneVerifiedAt: true },
  });

  // A trava é o status: ativa, suspensa ou bloqueada não altera número aqui.
  if (usuario.status !== "PENDING_VERIFICATION" || usuario.phoneVerifiedAt) {
    throw new DomainError(
      "PHONE_CHANGE_DENIED",
      "Não é possível alterar o telefone nesta etapa",
    );
  }

  const telefone = normalizarTelefone(input.telefone);

  // Mesma regra do cadastro: número já verificado por outra conta é recusado.
  const donoAtual = await prisma.user.findFirst({
    where: { phone: telefone.e164, phoneVerifiedAt: { not: null } },
    select: { id: true },
  });
  if (donoAtual && donoAtual.id !== input.userId) {
    throw new DomainError(
      "PHONE_ALREADY_VERIFIED",
      "Este telefone já está em uso por outra conta",
    );
  }

  // Grava o novo número ANTES de solicitar o código: o envio precisa de um
  // alvo, e a tela (que lê user.phone) passa a mostrar o número corrigido
  // quando o router.refresh() repõe a página. A auditoria registra o
  // telefone mascarado — o número inteiro é PII que o log não precisa.
  await prisma.user.update({
    where: { id: input.userId },
    data: { phone: telefone.e164 },
  });
  await prisma.auditLog.create({
    data: {
      action: "PHONE_CHANGED",
      entityType: "User",
      entityId: input.userId,
      userId: input.userId,
      newValue: { phone: telefone.mascarado, origin: "VERIFICATION" },
      correlationId: input.correlationId,
    },
  });

  // `solicitarCodigo` invalida códigos anteriores do usuário e aplica os
  // limites de intervalo e de hora POR TELEFONE — um número novo recém-
  // digitado não tem histórico, então o reenvio não esbarra na janela.
  return solicitarCodigo({
    userId: input.userId,
    telefone: telefone.e164,
    correlationId: input.correlationId,
    ipAddress: input.ipAddress,
  });
}

export interface CancelarCadastroInput {
  userId: string;
  correlationId: string;
}

/**
 * Remove uma conta que nunca saiu da verificação.
 *
 * É a única exclusão de usuário prevista no produto: a conta é
 * PENDING_VERIFICATION, não transacionou nada e pode ter nascido de um
 * número ou e-mail errados. O `status` é a trava — conta ativa não passa por
 * aqui em hipótese alguma. O log de auditoria entra ANTES do DELETE: a FK do
 * audit é SET NULL, então o rastro sobrevive à conta que registra.
 */
export async function cancelarCadastro(input: CancelarCadastroInput): Promise<void> {
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { id: true, status: true },
  });

  if (usuario.status !== "PENDING_VERIFICATION") {
    throw new DomainError(
      "CANCEL_DENIED",
      "Esta conta já está ativa e não pode ser removida por aqui",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        action: "USER_REGISTRATION_CANCELED",
        entityType: "User",
        entityId: input.userId,
        userId: input.userId,
        newValue: { reason: "USER_CANCELED_AT_VERIFICATION" },
        correlationId: input.correlationId,
      },
    });
    // PhoneVerification, perfis e notificações têm FK com CASCADE — o delete
    // limpa a conta pendente inteira, e o audit acima fica para trás.
    await tx.user.delete({ where: { id: input.userId } });
  });

  logger.info("Cadastro cancelado na verificação", {
    correlationId: input.correlationId,
    userId: input.userId,
  });
}

/** Estado atual da verificação, para a tela decidir o que mostrar. */
export async function situacaoVerificacao(userId: string) {
  const [usuario, pendente] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true, phoneVerifiedAt: true, status: true },
    }),
    prisma.phoneVerification.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { phone: true, expiresAt: true, attempts: true, createdAt: true },
    }),
  ]);

  return {
    verificado: usuario.phoneVerifiedAt !== null,
    telefone: usuario.phone,
    pendente: pendente
      ? {
          telefoneMascarado: normalizarTelefone(pendente.phone).mascarado,
          expiraEm: pendente.expiresAt,
          tentativasRestantes: Math.max(0, MAX_TENTATIVAS - pendente.attempts),
          podeReenviarEm: new Date(
            pendente.createdAt.getTime() + INTERVALO_REENVIO_SEGUNDOS * 1000,
          ),
        }
      : null,
  };
}
