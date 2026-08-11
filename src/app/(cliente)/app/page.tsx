import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, ButtonLink, Card, EmptyState, HoverCard } from "@/ui";
import { OrderCard, type OrdemAtiva } from "@/ui/order-card";

export const metadata: Metadata = { title: "Meus serviços" };

const ROTULO_STATUS: Record<
  string,
  { texto: string; tom: "success" | "warning" | "neutral" }
> = {
  RASCUNHO: { texto: "Rascunho", tom: "neutral" },
  ABERTA: { texto: "Aguardando propostas", tom: "neutral" },
  EM_NEGOCIACAO: { texto: "Em negociação", tom: "warning" },
  CONTRATADA: { texto: "Contratada", tom: "success" },
  CANCELADA: { texto: "Cancelada", tom: "neutral" },
  EXPIRADA: { texto: "Expirada", tom: "neutral" },
};

const ORDEM_STATUS: Record<
  string,
  { rotulo: string; tom: "neutral" | "brand" | "warning" | "success"; etapa: number }
> = {
  CRIADA: { rotulo: "Criada", tom: "neutral", etapa: 0 },
  AGUARDANDO_PAGAMENTO: { rotulo: "Aguardando pagamento", tom: "warning", etapa: 0 },
  PAGA: { rotulo: "Paga", tom: "brand", etapa: 1 },
  AUTORIZADA: { rotulo: "Agendada", tom: "brand", etapa: 2 },
  EM_EXECUCAO: { rotulo: "Em execução", tom: "brand", etapa: 3 },
  CONCLUIDA: { rotulo: "Concluída", tom: "success", etapa: 4 },
  LIQUIDADA: { rotulo: "Finalizada", tom: "success", etapa: 4 },
  EM_DISPUTA: { rotulo: "Em disputa", tom: "warning", etapa: 3 },
};

function dataHora(valor: Date | null | undefined): string | undefined {
  if (!valor) return undefined;
  return new Date(valor).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function AppHomePage() {
  const session = await requireCustomer();

  const [solicitacoes, ordensAtivas, saldoRetido] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { customerId: session.customerProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        category: { select: { name: true } },
        _count: { select: { proposals: true } },
        order: { select: { id: true, status: true } },
      },
    }),
    prisma.marketplaceOrder.findMany({
      where: {
        customerId: session.customerProfileId,
        status: {
          in: ["AGUARDANDO_PAGAMENTO", "PAGA", "AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA"],
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        provider: { select: { displayName: true } },
        appointment: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.marketplaceOrder.aggregate({
      where: {
        customerId: session.customerProfileId,
        status: { in: ["PAGA", "AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA"] },
      },
      _sum: { grossAmountCents: true },
    }),
  ]);

  const ordens: OrdemAtiva[] = ordensAtivas.map((ordem) => {
    const meta = ORDEM_STATUS[ordem.status] ?? {
      rotulo: ordem.status,
      tom: "neutral" as const,
      etapa: 0,
    };
    const pagamento = ordem.payments[0] ?? null;
    const s = ordem.status;
    const pago = ["PAGA", "AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA"].includes(s);
    const agendado = ["AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA"].includes(s);
    const emExecucao = ["EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA"].includes(s);
    const concluido = ["CONCLUIDA", "LIQUIDADA"].includes(s);

    return {
      id: ordem.id,
      requestId: ordem.requestId,
      reference: ordem.reference,
      tecnico: ordem.provider.displayName,
      statusRotulo: meta.rotulo,
      statusTom: meta.tom,
      valorFormatado: formatBRL(money(ordem.grossAmountCents)),
      etapaAtual: meta.etapa,
      precisaPagar: s === "AGUARDANDO_PAGAMENTO",
      timeline: [
        { rotulo: "Proposta aceita", estado: "concluida", quando: dataHora(ordem.createdAt) },
        {
          rotulo: "Pagamento aprovado",
          estado: pago ? "concluida" : "atual",
          quando: dataHora(pagamento?.paidAt),
        },
        {
          rotulo: "Serviço agendado",
          estado: agendado ? "concluida" : pago ? "atual" : "pendente",
          quando: dataHora(ordem.appointment?.scheduledAt),
        },
        {
          rotulo: "Serviço executado",
          estado: emExecucao ? "concluida" : agendado ? "atual" : "pendente",
          quando: dataHora(ordem.appointment?.startedAt),
        },
        {
          rotulo: "Pagamento liberado",
          estado: concluido ? "concluida" : emExecucao ? "atual" : "pendente",
          quando: dataHora(ordem.releasedAt),
        },
      ],
    };
  });

  const retido = saldoRetido._sum.grossAmountCents ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-[var(--accent-text)]">Sua conta</p>
          <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
            Início
          </h1>
        </div>
        <ButtonLink href="/app/solicitar">Solicitar serviço</ButtonLink>
      </div>

      {retido > 0 && (
        <Card className="accent-soft border p-5">
          <p className="eyebrow">Retido na plataforma</p>
          <p className="num mt-1.5 text-[1.75rem] leading-none font-extrabold text-[var(--accent-text)]">
            {formatBRL(money(retido))}
          </p>
          <p className="text-muted mt-2 text-xs leading-relaxed">
            Valor de serviços em andamento. Só é liberado ao técnico após a conclusão
            confirmada.
          </p>
        </Card>
      )}

      {ordens.length > 0 && (
        <section>
          <h2 className="mb-3.5 text-lg font-bold tracking-[-0.02em]">
            Serviços em andamento
          </h2>
          <ul className="flex flex-col gap-3">
            {ordens.map((ordem) => (
              <li key={ordem.id}>
                <OrderCard ordem={ordem} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-[-0.02em]">Solicitações recentes</h2>
          {solicitacoes.length > 0 && (
            <Link
              href="/app/solicitacoes"
              className="text-sm font-semibold text-[var(--accent-text)] hover:underline"
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
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {solicitacoes.map((solicitacao) => {
              const rotulo = ROTULO_STATUS[solicitacao.status] ?? {
                texto: solicitacao.status,
                tom: "neutral" as const,
              };
              return (
                <li key={solicitacao.id} className="min-w-0">
                  <Link href={`/app/solicitacoes/${solicitacao.id}`} className="block h-full">
                    <HoverCard className="h-full p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="min-w-0 truncate font-bold tracking-[-0.02em]">
                          {solicitacao.category.name}
                        </h3>
                        <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                      </div>
                      <p className="text-secondary mt-2 line-clamp-2 text-[0.875rem] leading-relaxed">
                        {solicitacao.description}
                      </p>
                      <p className="text-muted num mt-3 text-xs">
                        {formatBRL(money(solicitacao.proposedPriceCents))} ·{" "}
                        {solicitacao._count.proposals}{" "}
                        {solicitacao._count.proposals === 1 ? "proposta" : "propostas"}
                      </p>
                    </HoverCard>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
