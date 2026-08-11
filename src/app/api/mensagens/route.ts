import { NextResponse } from "next/server";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { sendMessageSchema } from "@/lib/validation/marketplace";
import { requireSession } from "@/server/auth/rbac";
import { enviarMensagem } from "@/server/services/message-service";

/**
 * Envio de mensagem no chat (§15).
 *
 * O remetente vem da sessão, nunca do corpo — e a autorização é por
 * participação na conversa, resolvida dentro do serviço junto da escrita, para
 * que não exista janela entre verificar e gravar.
 */
export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireSession();
  const input = await parseJsonBody(request, sendMessageSchema);

  const mensagem = await enviarMensagem({
    conversationId: input.conversationId,
    senderUserId: session.userId,
    texto: input.texto,
    correlationId,
  });

  return NextResponse.json({ mensagem }, { status: 201 });
});
