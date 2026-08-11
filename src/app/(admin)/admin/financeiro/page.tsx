import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState } from "@/ui";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Ledger" };

interface Props {
  searchParams: Promise<{ ordem?: string }>;
}

/**
 * Extrato do ledger (§21, §70).
 *
 * Somente leitura, e assim tem de ser: lançamento contábil não se edita nem se
 * apaga. Correção é lançamento novo, feito pelos serviços financeiros.
 *
 * A conferência que importa está no topo: **débitos e créditos têm de somar
 * igual**. Se não somarem, há bug em algum lançamento e a tela grita.
 */
export default async function AdminFinanceiroPage({ searchParams }: Props) {
  const { ordem } = await searchParams;

  const [transacoes, totais, contas] = await Promise.all([
    prisma.ledgerTransaction.findMany({
      where: ordem ? { orderId: ordem } : {},
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        entries: {
          include: { account: { select: { code: true, name: true, type: true } } },
        },
      },
    }),
    prisma.ledgerEntry.groupBy({ by: ["direction"], _sum: { amountCents: true } }),
    prisma.ledgerAccount.findMany({
      orderBy: { code: "asc" },
      include: { entries: { select: { direction: true, amountCents: true } } },
    }),
  ]);

  const debitos = totais.find((t) => t.direction === "DEBIT")?._sum.amountCents ?? 0;
  const creditos = totais.find((t) => t.direction === "CREDIT")?._sum.amountCents ?? 0;
  const bate = debitos === creditos;

  return (
    <div>
      <AdminHeader
        eyebrow="Financeiro"
        titulo="Ledger"
        descricao="Partidas dobradas de toda movimentação. Somente leitura: correção é lançamento novo, nunca edição do histórico."
      />

      <Card
        className={`mb-6 p-5 ${bate ? "accent-soft border" : "border-danger-500 border-2"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Invariante do ledger</p>
            <p
              className={`mt-1.5 text-lg font-extrabold ${
                bate ? "text-[var(--ok-text)]" : "text-danger-700"
              }`}
            >
              {bate
                ? "Débitos e créditos batem"
                : "DIVERGÊNCIA — débitos e créditos não batem"}
            </p>
          </div>
          <dl className="flex gap-8">
            <div>
              <dt className="eyebrow">Débitos</dt>
              <dd className="num mt-1 font-bold">{formatBRL(money(debitos))}</dd>
            </div>
            <div>
              <dt className="eyebrow">Créditos</dt>
              <dd className="num mt-1 font-bold">{formatBRL(money(creditos))}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <h2 className="mb-3 text-lg font-bold tracking-[-0.02em]">Saldo por conta</h2>
      <div className="mb-8 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {contas.map((c) => {
          const saldo = c.entries.reduce(
            (soma, e) => soma + (e.direction === "DEBIT" ? e.amountCents : -e.amountCents),
            0,
          );
          return (
            <Card key={c.id} className="min-w-0 p-4">
              <p className="eyebrow truncate">{c.name}</p>
              <p className="num mt-1.5 text-lg font-extrabold">
                {formatBRL(money(Math.abs(saldo)))}
              </p>
              <p className="text-muted mt-0.5 text-xs">
                {saldo >= 0 ? "devedor" : "credor"} · {c.entries.length} lançamentos
              </p>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 text-lg font-bold tracking-[-0.02em]">
        Transações {ordem && <span className="text-muted text-sm">· filtrado por ordem</span>}
      </h2>

      {transacoes.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum lançamento"
            description="Nada foi movimentado ainda com este filtro."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {transacoes.map((t) => {
            const somaDebito = t.entries
              .filter((e) => e.direction === "DEBIT")
              .reduce((s, e) => s + e.amountCents, 0);
            const somaCredito = t.entries
              .filter((e) => e.direction === "CREDIT")
              .reduce((s, e) => s + e.amountCents, 0);
            const equilibrada = somaDebito === somaCredito;

            return (
              <li key={t.id}>
                <Card className={`p-4 ${equilibrada ? "" : "border-danger-500 border-2"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{t.description}</p>
                      <p className="text-muted num mt-0.5 text-xs">
                        {t.createdAt.toLocaleString("pt-BR")}
                        {t.orderId && ` · ordem ${t.orderId.slice(-8)}`}
                        {t.correlationId && ` · ${t.correlationId.slice(0, 12)}`}
                      </p>
                    </div>
                    {!equilibrada && <Badge tone="danger">desequilibrada</Badge>}
                  </div>

                  <AdminTable colunas={["Conta", "Tipo", "Direção", "Valor"]}>
                    {t.entries.map((e) => (
                      <Linha key={e.id}>
                        <Celula className="text-secondary">{e.account.name}</Celula>
                        <Celula className="text-muted text-xs">{e.account.type}</Celula>
                        <Celula>
                          <Badge tone={e.direction === "DEBIT" ? "brand" : "neutral"}>
                            {e.direction === "DEBIT" ? "Débito" : "Crédito"}
                          </Badge>
                        </Celula>
                        <Celula numerica className="font-semibold">
                          {formatBRL(money(e.amountCents))}
                        </Celula>
                      </Linha>
                    ))}
                  </AdminTable>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
