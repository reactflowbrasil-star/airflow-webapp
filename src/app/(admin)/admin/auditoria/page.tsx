import type { Metadata } from "next";

import { prisma } from "@/server/db/prisma";
import { Badge, EmptyState, Input } from "@/ui";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Auditoria" };

interface Props {
  searchParams: Promise<{ acao?: string; entidade?: string }>;
}

/** Ações que mexem em dinheiro ou acesso — destacadas na lista. */
const SENSIVEIS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYOUT_COMPLETED",
  "PROVIDER_APPROVED",
  "PROVIDER_REJECTED",
  "USER_STATUS_CHANGED",
  "COMMISSION_RULE_DEACTIVATED",
  "DISPUTE_RESOLVED",
  "MESSAGE_CONTACT_REDACTED",
]);

/**
 * Trilha de auditoria (§44).
 *
 * Append-only por desenho: não há caminho no painel para apagar uma linha
 * daqui. Uma auditoria editável não é auditoria.
 */
export default async function AdminAuditoriaPage({ searchParams }: Props) {
  const { acao, entidade } = await searchParams;

  const [registros, acoes] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(acao ? { action: acao } : {}),
        ...(entidade ? { entityType: entidade } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 150,
      include: { user: { select: { email: true, role: true } } },
    }),
    prisma.auditLog.groupBy({ by: ["action"], _count: true, orderBy: { _count: { action: "desc" } }, take: 14 }),
  ]);

  return (
    <div>
      <AdminHeader
        eyebrow="Plataforma"
        titulo="Auditoria"
        descricao="Registro append-only de quem fez o quê. Não há como apagar uma linha daqui — uma auditoria editável não é auditoria."
      />

      <form className="mb-4 flex flex-wrap gap-3" action="/admin/auditoria">
        <label htmlFor="entidade" className="sr-only">
          Filtrar por entidade
        </label>
        <Input
          id="entidade"
          name="entidade"
          defaultValue={entidade}
          placeholder="Entidade (ex.: MarketplaceOrder)"
          className="max-w-xs"
        />
        <button
          type="submit"
          className="bg-grad h-12 rounded-(--radius-pill) px-6 text-[0.9375rem] font-semibold text-white"
        >
          Filtrar
        </button>
      </form>

      <nav aria-label="Filtrar por ação" className="mb-5 flex flex-wrap gap-2">
        <a
          href="/admin/auditoria"
          className={`rounded-(--radius-pill) border px-3 py-1.5 text-[0.8125rem] ${
            !acao
              ? "accent-soft border-[var(--accent)] font-semibold text-[var(--accent-text)]"
              : "surface-card text-secondary"
          }`}
        >
          Todas
        </a>
        {acoes.map((a) => (
          <a
            key={a.action}
            href={`/admin/auditoria?acao=${a.action}`}
            className={`rounded-(--radius-pill) border px-3 py-1.5 text-[0.8125rem] ${
              acao === a.action
                ? "accent-soft border-[var(--accent)] font-semibold text-[var(--accent-text)]"
                : "surface-card text-secondary"
            }`}
          >
            {a.action}
            <span className="num text-muted ml-1.5">{a._count}</span>
          </a>
        ))}
      </nav>

      <AdminTable
        colunas={["Quando", "Ação", "Entidade", "Autor", "Motivo", "Correlação"]}
        vazio={
          registros.length === 0 ? (
            <EmptyState title="Nada registrado" description="Nenhum evento com este filtro." />
          ) : undefined
        }
      >
        {registros.map((r) => (
          <Linha key={r.id}>
            <Celula numerica className="text-muted text-xs whitespace-nowrap">
              {r.createdAt.toLocaleString("pt-BR")}
            </Celula>
            <Celula>
              <Badge tone={SENSIVEIS.has(r.action) ? "warning" : "neutral"}>{r.action}</Badge>
            </Celula>
            <Celula className="text-secondary text-xs">
              {r.entityType}
              <span className="num text-muted block">{r.entityId.slice(-10)}</span>
            </Celula>
            <Celula className="text-secondary text-xs">
              {r.user?.email ?? <span className="text-muted">sistema</span>}
            </Celula>
            <Celula className="text-secondary max-w-xs text-xs">
              {r.reason ?? <span className="text-muted">—</span>}
            </Celula>
            <Celula className="num text-muted text-xs">
              {r.correlationId?.slice(0, 12) ?? "—"}
            </Celula>
          </Linha>
        ))}
      </AdminTable>

      <p className="text-muted mt-3 text-xs">Mostrando até 150 registros mais recentes.</p>
    </div>
  );
}
