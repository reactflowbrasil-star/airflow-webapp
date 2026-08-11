import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, IconBox } from "@/ui";
import { AdminHeader } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Visão geral" };

/**
 * Visão geral do painel.
 *
 * Duas seções com propósitos diferentes: em cima o que **exige ação hoje**
 * (fila de aprovação, disputas abertas, repasses parados, eventos mortos), e
 * embaixo o retrato financeiro. Um painel que só mostra números bonitos não
 * ajuda ninguém a operar.
 */
export default async function AdminHomePage() {
  const inicioDoMes = primeiroDiaDoMes();

  const [
    aguardandoAnalise,
    disputasAbertas,
    repassesPendentes,
    eventosMortos,
    usuarios,
    ordensAtivas,
    receitaMes,
    volumeMes,
    retido,
    aPagar,
    contasBloqueadas,
  ] = await Promise.all([
    prisma.providerProfile.count({ where: { status: "AGUARDANDO_ANALISE" } }),
    prisma.dispute.count({
      where: { status: { in: ["ABERTA", "EM_ANALISE", "AGUARDANDO_EVIDENCIA"] } },
    }),
    prisma.payout.count({ where: { status: { in: ["REQUESTED", "PROCESSING"] } } }),
    prisma.outboundEvent.count({ where: { status: "DEAD_LETTER" } }),
    prisma.user.groupBy({ by: ["role"], _count: true }),
    prisma.marketplaceOrder.count({
      where: { status: { in: ["PAGA", "AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA"] } },
    }),
    prisma.marketplaceOrder.aggregate({
      where: { status: "LIQUIDADA", completedAt: { gte: inicioDoMes } },
      _sum: { commissionAmountCents: true },
    }),
    prisma.marketplaceOrder.aggregate({
      where: { createdAt: { gte: inicioDoMes } },
      _sum: { grossAmountCents: true },
      _count: true,
    }),
    prisma.marketplaceOrder.aggregate({
      where: { status: { in: ["PAGA", "AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA"] } },
      _sum: { grossAmountCents: true },
    }),
    prisma.providerBalance.aggregate({
      _sum: { availableCents: true, pendingCents: true },
    }),
    prisma.user.count({ where: { status: { in: ["SUSPENDED", "BLOCKED"] } } }),
  ]);

  const porPapel = Object.fromEntries(usuarios.map((u) => [u.role, u._count]));

  const pendencias = [
    {
      href: "/admin/tecnicos",
      rotulo: "Cadastros para analisar",
      valor: aguardandoAnalise,
      icone: "user-check",
    },
    {
      href: "/admin/disputas",
      rotulo: "Disputas abertas",
      valor: disputasAbertas,
      icone: "scales",
    },
    {
      href: "/admin/repasses",
      rotulo: "Repasses na fila",
      valor: repassesPendentes,
      icone: "hand-coins",
    },
    {
      href: "/admin/eventos",
      rotulo: "Eventos em dead-letter",
      valor: eventosMortos,
      icone: "broadcast",
    },
  ];

  const total = pendencias.reduce((soma, p) => soma + p.valor, 0);

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader
        eyebrow="Painel"
        titulo="Visão geral"
        descricao="O que precisa de decisão hoje e o retrato financeiro da operação."
      />

      {/* Pendências — o que exige ação */}
      <section>
        <h2 className="mb-3.5 flex items-center gap-2 text-lg font-bold tracking-[-0.02em]">
          Precisa de você
          {total === 0 && <Badge tone="success">tudo em dia</Badge>}
        </h2>
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {pendencias.map((p) => (
            <li key={p.href} className="min-w-0">
              <Link href={p.href} className="block h-full">
                <Card
                  className={`h-full p-5 transition-all duration-250 hover:-translate-y-1 hover:shadow-(--shadow-float) ${
                    p.valor > 0 ? "border-[var(--accent)]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <IconBox name={p.icone} size={40} />
                    {p.valor > 0 && <Badge tone="warning">ação</Badge>}
                  </div>
                  <p
                    className={`num mt-3.5 text-[1.75rem] leading-none font-extrabold ${
                      p.valor > 0 ? "text-[var(--accent-text)]" : ""
                    }`}
                  >
                    {p.valor}
                  </p>
                  <p className="text-muted mt-1.5 text-[0.8125rem]">{p.rotulo}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Financeiro */}
      <section>
        <h2 className="mb-3.5 text-lg font-bold tracking-[-0.02em]">
          Financeiro do mês
        </h2>
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <Metrica
            rotulo="Receita de comissão"
            valor={formatBRL(money(receitaMes._sum.commissionAmountCents ?? 0))}
            detalhe="ordens liquidadas no mês"
            destaque
          />
          <Metrica
            rotulo="Volume transacionado"
            valor={formatBRL(money(volumeMes._sum.grossAmountCents ?? 0))}
            detalhe={`${volumeMes._count} ${volumeMes._count === 1 ? "pedido" : "pedidos"} no mês`}
          />
          <Metrica
            rotulo="Retido em escrow"
            valor={formatBRL(money(retido._sum.grossAmountCents ?? 0))}
            detalhe="serviços em andamento"
          />
          <Metrica
            rotulo="Saldo dos prestadores"
            valor={formatBRL(
              money(
                (aPagar._sum.availableCents ?? 0) + (aPagar._sum.pendingCents ?? 0),
              ),
            )}
            detalhe={`${formatBRL(money(aPagar._sum.availableCents ?? 0))} já sacável`}
          />
        </ul>
        <p className="text-muted mt-3 text-xs leading-relaxed">
          Valores derivados das ordens e dos saldos. O extrato por lançamento
          está em{" "}
          <Link
            href="/admin/financeiro"
            className="font-semibold text-[var(--accent-text)] hover:underline"
          >
            Ledger
          </Link>
          .
        </p>
      </section>

      {/* Base */}
      <section>
        <h2 className="mb-3.5 text-lg font-bold tracking-[-0.02em]">Base</h2>
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <Metrica rotulo="Clientes" valor={String(porPapel.CUSTOMER ?? 0)} />
          <Metrica rotulo="Técnicos" valor={String(porPapel.PROVIDER ?? 0)} />
          <Metrica rotulo="Serviços em andamento" valor={String(ordensAtivas)} />
          <Metrica
            rotulo="Contas restritas"
            valor={String(contasBloqueadas)}
            detalhe="suspensas ou bloqueadas"
          />
        </ul>
      </section>
    </div>
  );
}

/**
 * Fora do componente: instanciar Date no corpo do render é chamada impura, e a
 * regra existe para o resultado não variar entre renderizações da mesma árvore.
 */
function primeiroDiaDoMes(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

function Metrica({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <li className="min-w-0">
      <Card className={`h-full p-5 ${destaque ? "accent-soft border" : ""}`}>
        <p className="eyebrow">{rotulo}</p>
        <p
          className={`num mt-2 text-[1.5rem] leading-none font-extrabold ${
            destaque ? "text-[var(--accent-text)]" : ""
          }`}
        >
          {valor}
        </p>
        {detalhe && <p className="text-muted mt-1.5 text-xs">{detalhe}</p>}
      </Card>
    </li>
  );
}
