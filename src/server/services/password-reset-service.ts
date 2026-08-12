/**
 * Recuperação de senha via código no WhatsApp (§6 — mesmo padrão do cadastro).
 *
 * Regra de ouro: **a resposta nunca revela se o e-mail existe.** Um oráculo
 * de "este e-mail tem conta" é a ferramenta que um atacante usa para montar
 * a lista de alvos. Por isso o pedido de código responde 202 com a MESMA
 * mensagem — conta exista ou não — e o custo é equiparado com um hash bcrypt
 * inútil no caminho inexistente (mesmo truque do `authenticateUser`).
 *
 * A prova de posse é o código por WhatsApp enviado ao número verificado no
 * cadastro. O código é credencial tratada como tal: hash em repouso, uso
 * único, TTL e teto de tentativas — toda essa disciplina vive em
 * `verification-service`, e este módulo reutiliza `consumirCodigo` em vez de
 * duplicá-la.
 */

import bcrypt from "bcryptjs";

import { DomainError } from "@/domain/shared/errors";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";
import { consumirCodigo, solicitarCodigo } from "@/server/services/verification-service";

/**
 * Solicita o código de recuperação para o telefone da conta.
 *
 * Resposta idêntica em todos os caminhos: e-mail sem conta, conta sem
 * telefone verificado (não há para onde enviar), conta OK. Só o que muda é
 * o trabalho interno — e o bcrypt inútil no caminho inexistente equaliza o
 * custo de relógio entre os dois.
 */
export async function solicitarRecuperacaoSenha(input: {
  email: string;
  correlationId: string;
  ipAddress?: string;
}): Promise<{ ok: true }> {
  const email = input.email.toLowerCase();
  const usuario = await prisma.user.findUnique({ where: { email } });

  // Caminho inexistente: gasta o mesmo tempo de um hash de código para não
  // virar oráculo de existência por timing.
  if (!usuario || !usuario.phone || !usuario.phoneVerifiedAt) {
    await bcrypt.hash("nunca-sera-enviado", 8).catch(() => {});
    logger.info("Recuperação de senha solicitada (sem conta utilizável)", {
      correlationId: input.correlationId,
    });
    return { ok: true };
  }

  await solicitarCodigo({
    userId: usuario.id,
    telefone: usuario.phone,
    correlationId: input.correlationId,
    ipAddress: input.ipAddress,
    purpose: "RESET_SENHA",
  });

  logger.info("Recuperação de senha: código enviado", {
    correlationId: input.correlationId,
    userId: usuario.id,
  });

  return { ok: true };
}

export interface RedefinirSenhaInput {
  email: string;
  codigo: string;
  novaSenha: string;
  correlationId: string;
}

/**
 * Troca a senha após provar posse do telefone com o código.
 *
 * O `consumirCodigo` valida, limita tentativas e consome o código (uso
 * único). Depois: hash novo, `passwordChangedAt` gravado (revoga sessões
 * emitidas antes — ver `getSession`), auditoria. A sessão atual do
 * dispositivo (se houver) é encerrada pelo chamador; a troca nunca loga a
 * senha nem o código.
 */
export async function redefinirSenha(
  input: RedefinirSenhaInput,
): Promise<{ email: string }> {
  const email = input.email.toLowerCase();
  const usuario = await prisma.user.findUnique({ where: { email } });

  // E-mail inexistente cai na mesma mensagem genérica: não há código válido,
  // e dizer por quê seria confirmar a existência da conta.
  if (!usuario) {
    throw new DomainError("INVALID_CODE", "Código inválido ou expirado");
  }

  await consumirCodigo({
    userId: usuario.id,
    codigo: input.codigo,
    correlationId: input.correlationId,
    purpose: "RESET_SENHA",
  });

  const passwordHash = await hashPassword(input.novaSenha);
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: usuario.id },
      data: { passwordHash, passwordChangedAt: agora },
    });

    await tx.auditLog.create({
      data: {
        action: "PASSWORD_RESET",
        entityType: "User",
        entityId: usuario.id,
        userId: usuario.id,
        newValue: { channel: "WHATSAPP" },
        correlationId: input.correlationId,
      },
    });
  });

  logger.info("Senha redefinida", {
    correlationId: input.correlationId,
    userId: usuario.id,
  });

  return { email };
}
