import { NextResponse } from "next/server";

import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

/**
 * Stream SSE de novas solicitações para o prestador (§16) — o tempo real
 * sem WebSocket, no mesmo padrão do stream de mensagens.
 *
 * O prestador recebe um alerta quando entra na fila de candidatos de um
 * pedido (status ALERTADO). Este stream avisa quando o conjunto de alertas
 * muda; o cliente responde recarregando os alertas (`/api/prestador/alertas`)
 * e tocando o alerta sonoro. O servidor segue a única fonte de verdade — o
 * stream nunca transporta o conteúdo do pedido, só o aviso.
 *
 * Polling curto (5s) com keep-alive: tamanho honesto para o produto hoje,
 * mesma decisão do chat. A autorização é por participação: só candidatos do
 * próprio prestador aparecem aqui.
 */

export const dynamic = "force-dynamic";

const INTERVALO_MS = 5_000;
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
  let session;
  try {
    session = await requireProvider();
  } catch {
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
      let primeiraLeitura = true;
      let ultimaAssinatura = "";
      let ultimoKeepAlive = Date.now();
      try {
        // Primeiro frame: o navegador sabe que a conexão está de pé.
        controller.enqueue(frame("pronto"));

        while (!request.signal.aborted) {
          const candidatos = await prisma.dispatchCandidate.findMany({
            where: {
              providerId: session.providerProfileId,
              status: "ALERTADO",
              dispatch: { status: "ATIVA", activeProviderId: null },
              request: { status: "ABERTA", deletedAt: null },
            },
            orderBy: { queuePosition: "asc" },
            select: { id: true },
          });

          const assinatura = candidatos.map((candidate) => candidate.id).join("|");

          if (primeiraLeitura) {
            // A primeira leitura é a baseline — o cliente carrega os alertas
            // por conta própria na montagem.
            primeiraLeitura = false;
            ultimaAssinatura = assinatura;
          } else if (assinatura !== ultimaAssinatura) {
            controller.enqueue(frame("nova-solicitacao"));
            ultimaAssinatura = assinatura;
          } else if (Date.now() - ultimoKeepAlive > KEEP_ALIVE_MS) {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
            ultimoKeepAlive = Date.now();
          }

          await pausa(INTERVALO_MS, request.signal);
        }
      } catch (error) {
        // Cliente desconectou ou banco caiu: encerra. O EventSource reconecta
        // sozinho; o refresh de qualquer lado re-lê os alertas.
        logger.warn("Stream de solicitações encerrado por erro", {
          providerId: session.providerProfileId,
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
