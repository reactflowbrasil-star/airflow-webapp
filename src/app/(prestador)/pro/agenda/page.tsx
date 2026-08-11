import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState } from "@/ui";

export const metadata: Metadata = { title: "Agenda" };

const STATUS: Record<string, { rotulo: string; tom: "neutral" | "brand" | "success" }> = {
  AGUARDANDO: { rotulo: "Aguardando", tom: "neutral" },
  CONFIRMADO: { rotulo: "Confirmado", tom: "brand" },
  A_CAMINHO: { rotulo: "A caminho", tom: "brand" },
  EM_ANDAMENTO: { rotulo: "Em andamento", tom: "brand" },
  CONCLUIDO: { rotulo: "Concluído", tom: "success" },
};

export default async function AgendaPage() {
  const session = await requireProvider();

  const agendamentos = await prisma.appointment.findMany({
    where: { providerId: session.providerProfileId, status: { not: "CANCELADO" } },
    orderBy: { scheduledAt: "asc" },
    include: {
      order: {
        include: {
          request: {
            include: { category: { select: { name: true } }, address: true },
          },
        },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-[var(--accent-text)]">Operação</p>
        <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
          Agenda
        </h1>
      </div>

      {agendamentos.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum atendimento agendado"
            description="Serviços aparecem aqui depois que o cliente confirma o pagamento e a data é combinada."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {agendamentos.map((item) => {
            const estado = STATUS[item.status] ?? {
              rotulo: item.status,
              tom: "neutral" as const,
            };
            const endereco = item.order.request.address;
            return (
              <li key={item.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="num text-[0.8125rem] font-bold text-[var(--accent-text)]">
                        {item.scheduledAt.toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                      <h2 className="mt-1 font-bold tracking-[-0.02em]">
                        {item.order.request.category.name}
                      </h2>
                      {/* Endereço completo: serviço já autorizado (pago) */}
                      <p className="text-muted mt-1 text-[0.8125rem]">
                        {endereco.street}, {endereco.number} — {endereco.neighborhood},{" "}
                        {endereco.cityName}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={estado.tom}>{estado.rotulo}</Badge>
                      <span className="num text-[0.9375rem] font-bold">
                        {formatBRL(money(item.order.providerNetAmountCents))}
                      </span>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
