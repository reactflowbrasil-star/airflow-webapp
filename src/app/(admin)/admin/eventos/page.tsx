import type { Metadata } from "next";

import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState } from "@/ui";
import { AdminAction } from "@/ui/admin-action";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Eventos n8n" };

interface Props {
  searchParams: Promise<{ status?: string }>;
}

const STATUS: Record<string, { rotulo: string; tom: "neutral" | "success" | "warning" | "danger" }> = {
  PENDING: { rotulo: "Na fila", tom: "warning" },
  DELIVERED: { rotulo: "Entregue", tom: "success" },
  DEAD_LETTER: { rotulo: "Dead-letter", tom: "danger" },
};

/**
 * Fila de eventos para o n8n (padrão outbox).
 *
 * Um evento parado aqui atrasa notificação, nunca corrompe estado — o backend
 * segue sendo a fonte de verdade. Reenfileirar é seguro: o consumidor é
 * idempotente pela `idempotencyKey`, então reenviar um evento que na verdade
 * chegou não duplica efeito.
 */
export default async function AdminEventosPage({ searchParams }: Props) {
  const { status } = await searchParams;
  const filtro = status ?? "DEAD_LETTER";

  const [eventos, contagens] = await Promise.all([
    prisma.outboundEvent.findMany({
      where: filtro === "TODOS" ? {} : { status: filtro as never },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.outboundEvent.groupBy({ by: ["status"], _count: true }),
  ]);

  const porStatus = Object.fromEntries(contagens.map((c) => [c.status, c._count]));
  const mortos = porStatus.DEAD_LETTER ?? 0;

  return (
    <div>
      <AdminHeader
        eyebrow="Plataforma"
        titulo="Eventos n8n"
        descricao="Outbox de integração. Evento parado atrasa notificação, não corrompe estado — o backend continua a fonte de verdade."
      />

      {mortos > 0 && (
        <Card className="border-danger-500 mb-5 border-2 p-5">
          <p className="text-danger-700 font-bold">
            {mortos} {mortos === 1 ? "evento não entregue" : "eventos não entregues"}
          </p>
          <p className="text-secondary mt-1 text-sm">
            Esgotaram as tentativas de entrega. Verifique se o n8n está no ar
            antes de reenfileirar.
          </p>
        </Card>
      )}

      <nav aria-label="Filtrar por status" className="mb-5 flex flex-wrap gap-2">
        {["DEAD_LETTER", "PENDING", "DELIVERED", "TODOS"].map((valor) => (
          <a
            key={valor}
            href={`/admin/eventos?status=${valor}`}
            aria-current={filtro === valor ? "true" : undefined}
            className={`rounded-(--radius-pill) border px-3.5 py-1.5 text-[0.8125rem] transition-colors ${
              filtro === valor
                ? "accent-soft border-[var(--accent)] font-semibold text-[var(--accent-text)]"
                : "surface-card text-secondary hover:border-[var(--accent-border)]"
            }`}
          >
            {valor === "TODOS" ? "Todos" : (STATUS[valor]?.rotulo ?? valor)}
            {porStatus[valor] !== undefined && (
              <span className="num text-muted ml-1.5">{porStatus[valor]}</span>
            )}
          </a>
        ))}
      </nav>

      <AdminTable
        colunas={["Tipo", "Status", "Tentativas", "Próxima", "Último erro", "Criado", "Ações"]}
        vazio={
          eventos.length === 0 ? (
            <EmptyState
              title="Fila limpa"
              description="Nenhum evento com este status."
            />
          ) : undefined
        }
      >
        {eventos.map((e) => {
          const meta = STATUS[e.status] ?? { rotulo: e.status, tom: "neutral" as const };
          return (
            <Linha key={e.id}>
              <Celula>
                <span className="num font-medium">{e.eventType}</span>
                <span className="text-muted num block text-xs">
                  {e.idempotencyKey.slice(0, 42)}
                </span>
              </Celula>
              <Celula>
                <Badge tone={meta.tom}>{meta.rotulo}</Badge>
              </Celula>
              <Celula numerica>{e.attempts}</Celula>
              <Celula numerica className="text-muted text-xs">
                {e.status === "PENDING"
                  ? e.nextAttemptAt.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </Celula>
              <Celula className="text-secondary max-w-xs truncate text-xs">
                {e.lastError ?? "—"}
              </Celula>
              <Celula numerica className="text-muted text-xs">
                {e.createdAt.toLocaleDateString("pt-BR")}
              </Celula>
              <Celula>
                {e.status === "DEAD_LETTER" && (
                  <AdminAction
                    endpoint={`/api/admin/eventos/${e.id}`}
                    rotulo="Reenfileirar"
                    variante="secondary"
                    exigeMotivo={false}
                  />
                )}
              </Celula>
            </Linha>
          );
        })}
      </AdminTable>
    </div>
  );
}
