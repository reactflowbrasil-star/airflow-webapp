import { NextResponse } from "next/server";

import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

/**
 * Stream SSE do acompanhamento do pedido — o tempo real sem WebSocket, no
 * mesmo padrão do chat e das solicitações do prestador.
 *
 * O cliente acompanha a jornada (a caminho, chegou, em andamento, conclusão,
 * repasse, avaliação) sem recarregar a página: o stream avisa quando algo
 * muda na ordem (status, agendamento, fotos novas) e o cliente responde com
 * `router.refresh()` — o servidor segue a única fonte de verdade.
 *
 * Autorização por participação: ordem de outro cliente não aparece aqui
 * (a consulta filtra por customerId).
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  let session;
  try {
    session = await requireCustomer();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      { status: 401 },
    );
  }
  const { orderId } = await params;

  const encoder = new TextEncoder();
  const frame = (evento: string, dados = "{}") =>
    encoder.encode(`event: ${evento}\ndata: ${dados}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let primeiraLeitura = true;
      let ultimaAssinatura = "";
      let ultimoKeepAlive = Date.now();
      try {
        controller.enqueue(frame("pronto"));

        while (!request.signal.aborted) {
          const ordem = await prisma.marketplaceOrder.findFirst({
            where: { id: orderId, customerId: session.customerProfileId },
            select: {
              status: true,
              updatedAt: true,
              appointment: { select: { status: true, updatedAt: true } },
              payments: { select: { status: true, updatedAt: true } },
              review: { select: { id: true } },
            },
          });

          if (!ordem) {
            // Ordem alheia ou inexistente: encerra — o EventSource do
            // navegador reconecta, mas a página logo redireciona.
            controller.enqueue(frame("fim"));
            break;
          }

          const assinatura = JSON.stringify([
            ordem.status,
            ordem.updatedAt.toISOString(),
            ordem.appointment?.status,
            ordem.appointment?.updatedAt?.toISOString() ?? null,
            ordem.payments.map((p) => `${p.status}:${p.updatedAt.toISOString()}`),
            ordem.review ? "avaliado" : "sem-avaliacao",
          ]);

          if (primeiraLeitura) {
            primeiraLeitura = false;
            ultimaAssinatura = assinatura;
          } else if (assinatura !== ultimaAssinatura) {
            controller.enqueue(frame("atualizacao"));
            ultimaAssinatura = assinatura;
          } else if (Date.now() - ultimoKeepAlive > KEEP_ALIVE_MS) {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
            ultimoKeepAlive = Date.now();
          }

          await pausa(INTERVALO_MS, request.signal);
        }
      } catch (error) {
        logger.warn("Stream do pedido encerrado por erro", {
          userId: session.userId,
          orderId,
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
