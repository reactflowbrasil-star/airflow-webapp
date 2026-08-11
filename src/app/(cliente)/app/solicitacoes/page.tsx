import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, ButtonLink, Card, EmptyState, HoverCard } from "@/ui";

export const metadata: Metadata = { title: "Minhas solicitações" };

const ROTULO: Record<string, { texto: string; tom: "success" | "warning" | "neutral" }> = {
  RASCUNHO: { texto: "Rascunho", tom: "neutral" },
  ABERTA: { texto: "Aguardando propostas", tom: "neutral" },
  EM_NEGOCIACAO: { texto: "Em negociação", tom: "warning" },
  CONTRATADA: { texto: "Contratada", tom: "success" },
  CANCELADA: { texto: "Cancelada", tom: "neutral" },
  EXPIRADA: { texto: "Expirada", tom: "neutral" },
};

export default async function SolicitacoesPage() {
  const session = await requireCustomer();

  const solicitacoes = await prisma.serviceRequest.findMany({
    where: { customerId: session.customerProfileId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { name: true } },
      _count: { select: { proposals: true } },
      order: { select: { id: true, status: true, grossAmountCents: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-[var(--accent-text)]">Serviços</p>
          <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
            Minhas solicitações
          </h1>
        </div>
        <ButtonLink href="/app/solicitar">Nova solicitação</ButtonLink>
      </div>

      {solicitacoes.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma solicitação ainda"
            description="Quando você solicitar um serviço, ele aparece aqui com o histórico de propostas e o acompanhamento."
            action={<ButtonLink href="/app/solicitar">Solicitar serviço</ButtonLink>}
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {solicitacoes.map((s) => {
            const rotulo = ROTULO[s.status] ?? { texto: s.status, tom: "neutral" as const };
            return (
              <li key={s.id}>
                <Link href={`/app/solicitacoes/${s.id}`} className="block">
                  <HoverCard className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{s.category.name}</p>
                        <p className="text-secondary mt-0.5 line-clamp-1 text-sm">
                          {s.description}
                        </p>
                        <p className="text-muted mt-1.5 text-xs">
                          {new Date(s.createdAt).toLocaleDateString("pt-BR")} ·{" "}
                          {s._count.proposals}{" "}
                          {s._count.proposals === 1 ? "proposta" : "propostas"} ·
                          proposta inicial {formatBRL(money(s.proposedPriceCents))}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                        {s.order && (
                          <span className="num text-sm font-bold text-[var(--accent-text)]">
                            {formatBRL(money(s.order.grossAmountCents))}
                          </span>
                        )}
                      </div>
                    </div>
                  </HoverCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
