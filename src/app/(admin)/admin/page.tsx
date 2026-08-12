import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import {
  distribuicaoStatus,
  geometriaSerie,
  seriePorDia,
  STATUS_ORDEM,
  type ContagemStatus,
  type GeometriaSerie,
  type PontoSerieDia,
  type TomBadge,
} from "@/lib/admin-dashboard";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState, IconBox } from "@/ui";
import { AdminLiveRefresh } from "@/ui/admin-live";
import { AdminHeader } from "@/ui/admin-table";

export const metadata: Metadata = {
  title: "Visão geral",
  description:
    "Painel administrativo da AirFlow: pedidos, repasses, cadastros, disputas e auditoria em um lugar.",
};

/**
 * Visão geral do painel.
 *
 * Três planos com propósitos diferentes: em cima o que **exige ação hoje**
 * (fila de aprovação, disputas, repasses, eventos mortos) e os serviços em
 * andamento com atualização automática; no meio o retrato de curto prazo
 * (série de 14 dias e distribuição por status); embaixo o financeiro do mês.
 * Um painel que só mostra números bonitos não ajuda ninguém a operar.
 */
export default async function AdminHomePage() {
  const inicioDoMes = primeiroDiaDoMes();
  const agora = agoraParaPainel();
  const inicioSerie = inicioDaSerie(agora);

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
    serie,
    ordensAbertas,
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
    prisma.marketplaceOrder.findMany({
      where: { createdAt: { gte: inicioSerie } },
      select: {
        createdAt: true,
        status: true,
        grossAmountCents: true,
        commissionAmountCents: true,
      },
    }),
    prisma.marketplaceOrder.findMany({
      where: { status: { in: ["PAGA", "AUTORIZADA", "EM_EXECUCAO"] } },
      orderBy: { createdAt: "asc" },
      take: 8,
      include: {
        provider: { select: { displayName: true } },
        request: { select: { category: { select: { name: true } } } },
      },
    }),
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

  const pontos = seriePorDia(serie, 14, agora);
  const geometria = geometriaSerie(pontos, "brutoCents", 560, 160);
  const distribuicao = distribuicaoStatus(serie);
  const totalJanela = pontos.reduce((soma, p) => soma + p.brutoCents, 0);

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader
        eyebrow="Painel"
        titulo="Visão geral"
        descricao="O que precisa de decisão hoje, os serviços em andamento e o retrato financeiro da operação."
        acao={<AdminLiveRefresh />}
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

      {/* Serviços em andamento — o pulso da operação */}
      <section>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-[-0.02em]">Serviços em andamento</h2>
          <Link
            href="/admin/pedidos"
            className="text-[0.8125rem] font-semibold text-[var(--accent-text)] hover:underline"
          >
            ver todos os pedidos →
          </Link>
        </div>
        {ordensAbertas.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconBox name="receipt" size={52} />}
              title="Nenhum serviço em andamento"
              description="Quando um pagamento for aprovado ou um serviço entrar em execução, ele aparece aqui em tempo real."
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="flex flex-col">
              {ordensAbertas.map((o) => {
                const meta = STATUS_ORDEM[o.status] ?? {
                  rotulo: o.status,
                  tom: "brand" as const,
                };
                return (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--surface-border)] px-5 py-3.5 first:border-t-0"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <IconBox name="wrench" size={38} />
                      <span className="min-w-0">
                        <Link
                          href={`/admin/financeiro?ordem=${o.id}`}
                          className="num block truncate text-sm font-semibold text-[var(--accent-text)] hover:underline"
                        >
                          {o.reference}
                        </Link>
                        <span className="text-muted block truncate text-xs">
                          {o.provider.displayName} · {o.request.category.name}
                        </span>
                      </span>
                    </span>
                    <Badge tone={meta.tom}>{meta.rotulo}</Badge>
                    <span className="num text-sm font-bold">
                      {formatBRL(money(o.grossAmountCents))}
                    </span>
                    <span className="text-muted text-xs whitespace-nowrap">
                      {tempoRelativo(o.createdAt, agora)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* Gráficos — curto prazo */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.02em]">Volume dos últimos 14 dias</h2>
              <p className="text-muted mt-1 text-xs">
                {formatBRL(money(totalJanela))} no período ·{" "}
                {formatBRL(money(MediaDia(totalJanela, pontos.length)))} por dia
              </p>
            </div>
          </div>
          <GraficoSerie pontos={pontos} geometria={geometria} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-lg font-bold tracking-[-0.02em]">Pedidos por status</h2>
          <p className="text-muted mb-4 text-xs">Últimos 14 dias · top 6 estados</p>
          {distribuicao.length === 0 ? (
            <p className="text-secondary text-sm">Sem pedidos no período.</p>
          ) : (
            <GraficoStatus distribuicao={distribuicao} total={serie.length} />
          )}
        </Card>
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

      {/* Base e atalhos */}
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

      <section>
        <h2 className="mb-3.5 text-lg font-bold tracking-[-0.02em]">Acesso rápido</h2>
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {ATALHOS.map((a) => (
            <li key={a.href} className="min-w-0">
              <Link href={a.href} className="block h-full">
                <Card className="flex h-full items-center gap-3 p-4 transition-all duration-250 hover:-translate-y-1 hover:shadow-(--shadow-float)">
                  <IconBox name={a.icone} size={38} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{a.rotulo}</span>
                    <span className="text-muted block truncate text-xs">{a.descricao}</span>
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers puros — fora do componente (datas no corpo do render são impuras)   */
/* -------------------------------------------------------------------------- */

/** Fora do componente: instanciar Date no corpo do render é chamada impura. */
function primeiroDiaDoMes(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

function agoraParaPainel(): Date {
  return new Date();
}

/** Início da janela da série — hoje + 13 dias anteriores = 14 pontos. */
function inicioDaSerie(agora: Date): Date {
  const d = new Date(agora);
  d.setDate(d.getDate() - 13);
  d.setHours(0, 0, 0, 0);
  return d;
}

function tempoRelativo(data: Date, agora: Date): string {
  const diffMin = Math.floor((agora.getTime() - data.getTime()) / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min atrás`;
  const horas = Math.floor(diffMin / 60);
  if (horas < 24) return `${horas} h atrás`;
  return `${Math.floor(horas / 24)} d atrás`;
}

function MediaDia(totalCents: number, dias: number): number {
  return dias > 0 ? Math.round(totalCents / dias) : 0;
}

/* -------------------------------------------------------------------------- */
/* Componentes de exibição                                                     */
/* -------------------------------------------------------------------------- */

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

/** Gráfico de área em SVG puro — sem lib de charts, sem JS no cliente. */
function GraficoSerie({
  pontos,
  geometria,
}: {
  pontos: readonly PontoSerieDia[];
  geometria: GeometriaSerie;
}) {
  return (
    <figure>
      <svg
        viewBox="0 0 560 160"
        className="h-40 w-full"
        role="img"
        aria-label="Volume transacionado por dia nos últimos 14 dias"
      >
        <title>Volume transacionado por dia nos últimos 14 dias</title>
        {/* Linhas de grade horizontais — orientam o olho sem eixo y numérico */}
        <g stroke="var(--surface-border)" strokeDasharray="4 6" aria-hidden="true">
          <line x1="0" y1="40" x2="560" y2="40" />
          <line x1="0" y1="80" x2="560" y2="80" />
          <line x1="0" y1="120" x2="560" y2="120" />
        </g>
        <path
          d={geometria.area}
          fill="var(--accent)"
          opacity="0.16"
          aria-hidden="true"
        />
        <path
          d={geometria.linha}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          aria-hidden="true"
        />
        {geometria.pontos.map((p) => {
          const dia = pontos.find((d) => d.dia === p.dia);
          if (!dia) return null;
          return (
            <circle key={p.dia} cx={p.x} cy={p.y} r="3" fill="var(--accent)">
              <title>{`${dia.rotulo}: ${formatBRL(money(dia.brutoCents))} · ${dia.pedidos} ${
                dia.pedidos === 1 ? "pedido" : "pedidos"
              }`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 flex justify-between text-muted text-[0.6875rem]">
        <span>{pontos[0]?.rotulo}</span>
        <span>{pontos[Math.floor(pontos.length / 2)]?.rotulo}</span>
        <span>{pontos.at(-1)?.rotulo}</span>
      </figcaption>
    </figure>
  );
}

/** Barras horizontais de distribuição por status — legíveis sem cor. */
function GraficoStatus({
  distribuicao,
  total,
}: {
  distribuicao: readonly ContagemStatus[];
  total: number;
}) {
  const max = distribuicao[0]?.contagem ?? 0;
  return (
    <ul className="flex flex-col gap-3">
      {distribuicao.slice(0, 6).map(({ status, contagem }) => {
        const meta = STATUS_ORDEM[status] ?? { rotulo: status, tom: "neutral" as const };
        const pct = total > 0 ? Math.round((contagem / total) * 100) : 0;
        const largura = max > 0 ? Math.max(6, Math.round((contagem / max) * 100)) : 0;
        return (
          <li key={status}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${COR_TOM[meta.tom]}`}
                  aria-hidden="true"
                />
                <span className="truncate text-secondary">{meta.rotulo}</span>
              </span>
              <span className="num text-muted shrink-0 text-xs">
                {contagem} · {pct}%
              </span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full"
              style={{ background: "var(--track)" }}
              role="img"
              aria-label={`${meta.rotulo}: ${contagem} pedidos (${pct}%)`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${largura}%`, background: "var(--accent)" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const COR_TOM: Record<TomBadge, string> = {
  neutral: "bg-[var(--text-muted)]",
  brand: "bg-[var(--accent)]",
  success: "bg-[var(--ok-text)]",
  warning: "bg-[var(--warn-text)]",
  danger: "bg-danger-700",
  ice: "bg-[var(--accent)]",
};

const ATALHOS = [
  {
    href: "/admin/tecnicos",
    rotulo: "Aprovar técnicos",
    descricao: "Cadastros na fila",
    icone: "user-check",
  },
  {
    href: "/admin/usuarios",
    rotulo: "Usuários",
    descricao: "Contas e restrições",
    icone: "users-three",
  },
  {
    href: "/admin/pedidos",
    rotulo: "Pedidos",
    descricao: "Ordens do marketplace",
    icone: "receipt",
  },
  {
    href: "/admin/financeiro",
    rotulo: "Ledger",
    descricao: "Extrato por lançamento",
    icone: "book-open",
  },
  {
    href: "/admin/repasses",
    rotulo: "Repasses",
    descricao: "Pagamentos a profissionais",
    icone: "hand-coins",
  },
  {
    href: "/admin/disputas",
    rotulo: "Disputas",
    descricao: "Mediação cliente × técnico",
    icone: "scales",
  },
];
