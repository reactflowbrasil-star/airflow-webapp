/**
 * Chat entre cliente e prestador (§15).
 *
 * A conversa não é um recurso que o usuário cria: ela nasce junto da primeira
 * proposta e acompanha a solicitação. Assim o histórico de uma negociação —
 * texto livre, propostas, pagamento, agendamento, execução — fica todo num
 * mesmo fio, que é o que uma mediação de disputa precisa ler depois (§39).
 *
 * Duas regras não negociáveis:
 *   1. Toda mensagem passa pela guarda de contato. O canal é a plataforma.
 *   2. Mensagens automáticas são escritas pelos serviços de domínio dentro da
 *      transação do fato que as originou — nunca depois, "por fora".
 */

import { redigirContato } from "@/domain/messaging/contact-guard";
import { DomainError } from "@/domain/shared/errors";
import type { MessageType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

type Db = Prisma.TransactionClient;

/** Limite de texto livre — alinhado ao schema e ao textarea da UI. */
export const LIMITE_MENSAGEM = 2000;

interface ConversaChave {
  requestId: string;
  customerId: string;
  providerId: string;
}

/**
 * Devolve a conversa da dupla nesta solicitação, criando se ainda não existir.
 *
 * Concorrência: duas propostas simultâneas tentariam criar a mesma conversa.
 * A unique `(requestId, customerId, providerId)` decide o empate e o P2002 é
 * relido em vez de propagado — o resultado correto é "a conversa existe".
 */
export async function ensureConversation(
  db: Db,
  chave: ConversaChave,
): Promise<string> {
  const existente = await db.conversation.findUnique({
    where: {
      requestId_customerId_providerId: chave,
    },
    select: { id: true },
  });
  if (existente) return existente.id;

  try {
    const criada = await db.conversation.create({
      data: chave,
      select: { id: true },
    });
    return criada.id;
  } catch (error) {
    if (isUnique(error)) {
      const concorrente = await db.conversation.findUniqueOrThrow({
        where: { requestId_customerId_providerId: chave },
        select: { id: true },
      });
      return concorrente.id;
    }
    throw error;
  }
}

interface MensagemAutomatica {
  conversationId: string;
  type: MessageType;
  content: string;
  /** Dados já sanitizados para a UI renderizar (valor, data). Sem contatos. */
  metadata?: Record<string, unknown>;
}

/**
 * Registra mensagem de sistema/evento na transação do chamador.
 *
 * Sem guarda de contato: o texto é nosso, não do usuário. Passar por ela só
 * criaria o risco de mascarar um valor legítimo ("R$ 280,00" tem 5 dígitos).
 */
export async function appendSystemMessage(
  db: Db,
  { conversationId, type, content, metadata }: MensagemAutomatica,
): Promise<void> {
  await db.message.create({
    data: {
      conversationId,
      senderId: null,
      type,
      content,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
  await db.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
}

/**
 * Atalho para os serviços de domínio: garante a conversa e grava o evento
 * numa tacada só, dentro da transação em curso.
 */
export async function recordConversationEvent(
  db: Db,
  chave: ConversaChave,
  evento: Omit<MensagemAutomatica, "conversationId">,
): Promise<void> {
  const conversationId = await ensureConversation(db, chave);
  await appendSystemMessage(db, { ...evento, conversationId });
}

/**
 * Mesma coisa a partir de uma ordem — que já carrega a tripla da conversa.
 * Evita que cada serviço do fluxo de execução refaça a busca da solicitação.
 */
export async function recordOrderEvent(
  db: Db,
  order: { requestId: string; customerId: string; providerId: string },
  evento: Omit<MensagemAutomatica, "conversationId">,
): Promise<void> {
  await recordConversationEvent(
    db,
    {
      requestId: order.requestId,
      customerId: order.customerId,
      providerId: order.providerId,
    },
    evento,
  );
}

export interface EnviarMensagemInput {
  conversationId: string;
  /** Usuário autenticado. A participação é verificada aqui, não na rota. */
  senderUserId: string;
  texto: string;
  correlationId: string;
}

export interface MensagemEnviada {
  id: string;
  content: string;
  createdAt: Date;
  /** `true` quando a guarda suprimiu algo — a UI avisa quem escreveu. */
  redigida: boolean;
}

/**
 * Envia texto livre de um participante.
 *
 * A autorização é por participação na conversa, não por papel: ter o papel
 * CUSTOMER não dá acesso à conversa de outro cliente.
 */
export async function enviarMensagem(
  input: EnviarMensagemInput,
): Promise<MensagemEnviada> {
  const texto = input.texto.trim();
  if (texto.length === 0) {
    throw new DomainError("MESSAGE_EMPTY", "Escreva uma mensagem antes de enviar");
  }
  if (texto.length > LIMITE_MENSAGEM) {
    throw new DomainError(
      "MESSAGE_TOO_LONG",
      `Mensagem acima de ${LIMITE_MENSAGEM} caracteres`,
    );
  }

  const guarda = redigirContato(texto);

  return prisma.$transaction(async (tx) => {
    const conversa = await tx.conversation.findUnique({
      where: { id: input.conversationId },
      select: {
        id: true,
        archived: true,
        customer: { select: { userId: true } },
        provider: { select: { userId: true } },
      },
    });

    // Conversa inexistente e conversa alheia dão a mesma resposta: existir ou
    // não é informação que só um participante deveria conseguir distinguir.
    const participa =
      conversa !== null &&
      (conversa.customer.userId === input.senderUserId ||
        conversa.provider.userId === input.senderUserId);
    if (!participa) {
      throw new DomainError("CONVERSATION_NOT_FOUND", "Conversa não encontrada");
    }
    if (conversa.archived) {
      throw new DomainError("CONVERSATION_ARCHIVED", "Esta conversa foi encerrada");
    }

    const mensagem = await tx.message.create({
      data: {
        conversationId: conversa.id,
        senderId: input.senderUserId,
        type: "TEXT",
        content: guarda.texto,
      },
      select: { id: true, content: true, createdAt: true },
    });
    await tx.conversation.update({
      where: { id: conversa.id },
      data: { lastMessageAt: mensagem.createdAt },
    });

    if (guarda.redigido) {
      // Auditável (§44) sem vazar: só os rótulos dos padrões, jamais o trecho.
      await tx.auditLog.create({
        data: {
          action: "MESSAGE_CONTACT_REDACTED",
          entityType: "Message",
          entityId: mensagem.id,
          newValue: { patterns: guarda.padroes },
          userId: input.senderUserId,
          correlationId: input.correlationId,
        },
      });
      logger.warn("Dados de contato suprimidos numa mensagem", {
        correlationId: input.correlationId,
        messageId: mensagem.id,
        patterns: guarda.padroes,
      });
    }

    return {
      id: mensagem.id,
      content: mensagem.content ?? "",
      createdAt: mensagem.createdAt,
      redigida: guarda.redigido,
    };
  });
}

export interface MensagemDaConversa {
  id: string;
  tipo: string;
  texto: string;
  quando: string;
  /** Lado da bolha: `true` quando a mensagem é de quem está lendo. */
  minha: boolean;
}

/**
 * Carrega o fio de uma conversa já orientado para quem lê.
 *
 * Cliente e prestador veem a mesma conversa espelhada, e decidir o lado da
 * bolha em cada página levaria as duas telas a divergir. Propostas não têm
 * remetente (nascem de um serviço, não de um POST), então o lado sai do autor
 * registrado no metadata.
 */
export async function carregarConversa(
  conversationId: string,
  leitor: { userId: string; papel: "CLIENTE" | "PRESTADOR" },
  limite = 200,
): Promise<MensagemDaConversa[]> {
  const registros = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: limite,
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      senderId: true,
      metadata: true,
    },
  });

  return registros.map((mensagem) => {
    const autor =
      mensagem.metadata !== null &&
      typeof mensagem.metadata === "object" &&
      !Array.isArray(mensagem.metadata)
        ? (mensagem.metadata as Record<string, unknown>).author
        : undefined;

    return {
      id: mensagem.id,
      tipo: mensagem.type,
      texto: mensagem.content ?? "",
      quando: mensagem.createdAt.toISOString(),
      minha:
        typeof autor === "string"
          ? autor === leitor.papel
          : mensagem.senderId === leitor.userId,
    };
  });
}

/** Marca como lidas as mensagens que o usuário não enviou. */
export async function marcarComoLidas(
  conversationId: string,
  leitorUserId: string,
): Promise<void> {
  await prisma.message.updateMany({
    where: {
      conversationId,
      readAt: null,
      NOT: { senderId: leitorUserId },
    },
    data: { readAt: new Date() },
  });
}

function isUnique(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}
