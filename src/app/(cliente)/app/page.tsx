import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, ButtonLink, Card, EmptyState } from "@/ui";

export const metadata: Metadata = { title: "Meus serviços" };

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ABERTA: "Aguardando propostas",
  EM_NEGOCIACAO: "Em negociação",
  CONTRATADA: "Contratada",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
};

const ROTULO_ORDEM: Record<string, string> = {
  CRIADA: "Criada",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  PAGA: "Paga",
  AUTORIZADA: "Agendada",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  LIQUIDADA: "Finalizada",
  CANCELADA: "Cancelada",
  EM_DISPUTA: "Em disputa",
  ESTORNADA: "Estornada",
};

export default async function AppHomePage() {
  const session = await requireCustomer();

  const [solicitacoes, ordensAtivas] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { customerId: session.customerProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        category: { select: { name: true } },
        _count: { select: { proposals: true } },
        order: { select: { id: true, status: true } },
      },
    }),
    prisma.marketplaceOrder.findMany({
      where: {
        customerId: session.customerProfileId,
        status: { in: ["AGUARDANDO_PAGAMENTO", "PAGA", "AUTORIZADA", "EM_EXECUCAO"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        provider: { select: { displayName: true, slug: true } },
        appointment: { select: { scheduledAt: true, status: true } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Início</h1>
        <ButtonLink href="/app/solicitar">Solicitar serviço</ButtonLink>
      </div>

      {/* Serviços em andamento — o que exige ação */}
      {ordensAtivas.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Serviços em andamento</h2>
          <ul className="flex flex-col gap-3">
            {ordensAtivas.map((ordem) => (
              <li key={ordem.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{ordem.provider.displayName}</p>
                      <p className="text-muted mt-0.5 text-sm">
                        Pedido {ordem.reference} ·{" "}
                        {formatBRL(money(ordem.grossAmountCents))}
                      </p>
                      {ordem.appointment && (
                        <p className="text-secondary mt-1 text-sm">
                          {new Date(ordem.appointment.scheduledAt).toLocaleString(
                            "pt-BR",
                            { dateStyle: "short", timeStyle: "short" },
                          )}
                        </p>
                      )}
                    </div>
                    <Badge
                      tone={
                        ordem.status === "AGUARDANDO_PAGAMENTO" ? "warning" : "brand"
                      }
                    >
                      {ROTULO_ORDEM[ordem.status] ?? ordem.status}
                    </Badge>
                  </div>

                  <div className="mt-3 flex gap-2">
                    {ordem.status === "AGUARDANDO_PAGAMENTO" ? (
                      <ButtonLink href={`/app/checkout/${ordem.id}`} size="sm">
                        Pagar agora
                      </ButtonLink>
                    ) : (
                      <ButtonLink
                        href={`/app/solicitacoes/${ordem.requestId}`}
                        size="sm"
                        variant="secondary"
                      >
                        Acompanhar
                      </ButtonLink>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Solicitações recentes */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Solicitações recentes</h2>
          {solicitacoes.length > 0 && (
            <Link
              href="/app/solicitacoes"
              className="text-brand-600 text-sm hover:underline"
            >
              Ver todas
            </Link>
          )}
        </div>

        {solicitacoes.length === 0 ? (
          <Card>
            <EmptyState
              title="Você ainda não solicitou nenhum serviço"
              description="Descreva o que precisa, proponha um valor e receba propostas de técnicos verificados da sua região."
              action={<ButtonLink href="/app/solicitar">Solicitar serviço</ButtonLink>}
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {solicitacoes.map((solicitacao) => (
              <li key={solicitacao.id}>
                <Link href={`/app/solicitacoes/${solicitacao.id}`} className="block">
                  <Card className="hover:border-brand-300 p-4 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{solicitacao.category.name}</p>
                        <p className="text-secondary mt-0.5 line-clamp-1 text-sm">
                          {solicitacao.description}
                        </p>
                        <p className="text-muted mt-1 text-xs">
                          Sua proposta:{" "}
                          {formatBRL(money(solicitacao.proposedPriceCents))} ·{" "}
                          {solicitacao._count.proposals}{" "}
                          {solicitacao._count.proposals === 1
                            ? "proposta"
                            : "propostas"}
                        </p>
                      </div>
                      <Badge
                        tone={
                          solicitacao.status === "CONTRATADA"
                            ? "success"
                            : solicitacao.status === "EM_NEGOCIACAO"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {ROTULO_STATUS[solicitacao.status] ?? solicitacao.status}
                      </Badge>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
