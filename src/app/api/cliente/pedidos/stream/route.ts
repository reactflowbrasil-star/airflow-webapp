import { NextResponse } from "next/server";

import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

/**
 * Stream SSE do dashboard do cliente: avisa quando qualquer ordem ativa muda
 * de status (pagamento confirmado, a caminho, conclusão…) para o dashboard
 * recarregar sozinho — mesmo padrão do stream do pedido, agregado.
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
    session = await requireCustomer();
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
        controller.enqueue(frame("pronto"));

        while (!request.signal.aborted) {
          const ordens = await prisma.marketplaceOrder.findMany({
            where: {
              customerId: session.customerProfileId,
              status: {
                in: ["AGUARDANDO_PAGAMENTO", "PAGA", "AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA"],
              },
            },
            select: {
              id: true,
              status: true,
              updatedAt: true,
              appointment: { select: { status: true } },
            },
            orderBy: { updatedAt: "desc" },
          });

          const assinatura = ordens
            .map(
              (ordem) =>
                `${ordem.id}:${ordem.status}:${ordem.appointment?.status ?? "sem"}:${ordem.updatedAt.getTime()}`,
            )
            .join("|");

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
        logger.warn("Stream do dashboard encerrado por erro", {
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
