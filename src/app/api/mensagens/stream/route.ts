import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

/**
 * Stream SSE de novidades do chat (§15) — o tempo real sem WebSocket.
 *
 * O envio de mensagem faz `router.refresh()` no emissor, mas quem está do
 * outro lado não veria nada sem recarregar a página. Este stream avisa quando
 * há mensagem nova nas conversas do usuário; o cliente responde com
 * `router.refresh()` e o servidor continua sendo a única fonte de verdade —
 * o stream só diz "tem novidade", nunca transporta conteúdo.
 *
 * Implementação honesta para o tamanho do produto: polling curto (4s) no
 * banco com keep-alive para o proxy. Sem WebSocket, sem estado em memória.
 * Antes de escalar, vale trocar o polling por LISTEN/NOTIFY ou um broker —
 * a forma do evento (`nova-mensagem`) não muda para o cliente.
 */

export const dynamic = "force-dynamic";

const INTERVALO_MS = 4_000;
const KEEP_ALIVE_MS = 15_000;

function pausa(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      { status: 401 },
    );
  }

  const encoder = new TextEncoder();
  const frame = (evento: string, dados = "{}") =>
    encoder.encode(`event: ${evento}\ndata: ${dados}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let ultimoCheck = new Date();
      let ultimoKeepAlive = Date.now();
      try {
        // Primeiro frame: o navegador sabe que a conexão está de pé.
        controller.enqueue(frame("pronto"));

        while (!request.signal.aborted) {
          // Novidade = mensagem alheia (ou de sistema) criada desde o último
          // check numa conversa em que o usuário participa. A participação é
          // a autorização: conversa de outro usuário não aparece aqui.
          const novidades = await prisma.message.count({
            where: {
              conversation: {
                archived: false,
                OR: [
                  { customer: { userId: session.userId } },
                  { provider: { userId: session.userId } },
                ],
              },
              createdAt: { gt: ultimoCheck },
              OR: [{ senderId: null }, { senderId: { not: session.userId } }],
            },
          });

          const agora = new Date();
          if (novidades > 0) {
            controller.enqueue(frame("nova-mensagem"));
            ultimoCheck = agora;
          } else if (Date.now() - ultimoKeepAlive > KEEP_ALIVE_MS) {
            // Comentário de keep-alive: mantém proxy e cliente ligados.
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
            ultimoKeepAlive = Date.now();
          }

          await pausa(INTERVALO_MS, request.signal);
        }
      } catch (error) {
        // Cliente desconectou ou banco caiu: encerra. O EventSource do
        // navegador reconecta sozinho (com backoff), então a perda de uma
        // conexão não perde a conversa — o refresh de qualquer lado re-lê.
        logger.warn("Stream de mensagens encerrado por erro", {
          userId: session.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Já fechado pelo cliente — nada a fazer.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
