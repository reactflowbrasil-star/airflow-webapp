import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import type { $Enums } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { Badge, EmptyState } from "@/ui";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Pedidos" };

const STATUS: Record<string, { rotulo: string; tom: "neutral" | "brand" | "success" | "warning" | "danger" }> = {
  CRIADA: { rotulo: "Criada", tom: "neutral" },
  AGUARDANDO_PAGAMENTO: { rotulo: "Aguardando pagamento", tom: "warning" },
  PAGA: { rotulo: "Paga", tom: "brand" },
  AUTORIZADA: { rotulo: "Agendada", tom: "brand" },
  EM_EXECUCAO: { rotulo: "Em execução", tom: "brand" },
  CONCLUIDA: { rotulo: "Concluída", tom: "success" },
  LIQUIDADA: { rotulo: "Liquidada", tom: "success" },
  CANCELADA: { rotulo: "Cancelada", tom: "neutral" },
  EM_DISPUTA: { rotulo: "Em disputa", tom: "danger" },
  ESTORNADA: { rotulo: "Estornada", tom: "danger" },
};

interface Props {
  searchParams: Promise<{ status?: string }>;
}

/**
 * Pedidos da plataforma.
 *
 * Somente leitura: mudar o estado de uma ordem à mão contornaria a máquina de
 * estado e o ledger. Correção se faz pelo fluxo — disputa, estorno ou
 * lançamento compensatório.
 */
export default async function AdminPedidosPage({ searchParams }: Props) {
  const { status } = await searchParams;

  const [ordens, contagens] = await Promise.all([
    prisma.marketplaceOrder.findMany({
      // Valida a string da URL contra os estados reais — sem isso, um
      // `?status=qualquer_coisa` virava 500 e a tipagem era burlada com `never`.
      where:
        status && Object.keys(STATUS).includes(status)
          ? { status: status as $Enums.OrderStatus }
          : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { include: { user: { select: { name: true } } } },
        provider: { select: { displayName: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
    prisma.marketplaceOrder.groupBy({ by: ["status"], _count: true }),
  ]);

  const porStatus = Object.fromEntries(contagens.map((c) => [c.status, c._count]));

  return (
    <div>
      <AdminHeader
        eyebrow="Operação"
        titulo="Pedidos"
        descricao="Ordens do marketplace com o valor bruto, a comissão congelada no aceite e o líquido do profissional."
      />

      <nav aria-label="Filtrar por status" className="mb-5 flex flex-wrap gap-2">
        {["TODOS", ...Object.keys(STATUS)].map((valor) => (
          <a
            key={valor}
            href={`/admin/pedidos?status=${valor}`}
            aria-current={(status ?? "TODOS") === valor ? "true" : undefined}
            className={`rounded-(--radius-pill) border px-3 py-1.5 text-[0.8125rem] transition-colors ${
              (status ?? "TODOS") === valor
                ? "accent-soft border-[var(--accent)] font-semibold text-[var(--accent-text)]"
                : "surface-card text-secondary hover:border-[var(--accent-border)]"
            }`}
          >
            {valor === "TODOS" ? "Todos" : STATUS[valor].rotulo}
            {porStatus[valor] !== undefined && (
              <span className="num text-muted ml-1.5">{porStatus[valor]}</span>
            )}
          </a>
        ))}
      </nav>

      <AdminTable
        colunas={["Referência", "Cliente", "Técnico", "Status", "Bruto", "Comissão", "Líquido", "Criada"]}
        vazio={
          ordens.length === 0 ? (
            <EmptyState title="Nenhum pedido" description="Nenhuma ordem com este status." />
          ) : undefined
        }
      >
        {ordens.map((o) => {
          const meta = STATUS[o.status] ?? { rotulo: o.status, tom: "neutral" as const };
          return (
            <Linha key={o.id}>
              <Celula>
                <Link
                  href={`/admin/financeiro?ordem=${o.id}`}
                  className="num font-semibold text-[var(--accent-text)] hover:underline"
                >
                  {o.reference}
                </Link>
              </Celula>
              <Celula className="text-secondary">{o.customer.user.name}</Celula>
              <Celula className="text-secondary">{o.provider.displayName}</Celula>
              <Celula>
                <Badge tone={meta.tom}>{meta.rotulo}</Badge>
              </Celula>
              <Celula numerica className="font-semibold">
                {formatBRL(money(o.grossAmountCents))}
              </Celula>
              <Celula numerica className="text-[var(--accent-text)]">
                {formatBRL(money(o.commissionAmountCents))}
              </Celula>
              <Celula numerica>{formatBRL(money(o.providerNetAmountCents))}</Celula>
              <Celula numerica className="text-muted text-xs">
                {o.createdAt.toLocaleDateString("pt-BR")}
              </Celula>
            </Linha>
          );
        })}
      </AdminTable>
    </div>
  );
}
