import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState } from "@/ui";
import { AdminAction } from "@/ui/admin-action";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Repasses" };

const STATUS: Record<string, { rotulo: string; tom: "neutral" | "brand" | "success" | "warning" | "danger" }> = {
  REQUESTED: { rotulo: "Solicitado", tom: "warning" },
  PROCESSING: { rotulo: "Processando", tom: "brand" },
  PAID: { rotulo: "Pago", tom: "success" },
  FAILED: { rotulo: "Falhou", tom: "danger" },
  CANCELED: { rotulo: "Cancelado", tom: "neutral" },
};

/**
 * Fila de repasses (§28).
 *
 * A chave PIX aparece mascarada: o operador precisa conferir o final para
 * bater com o comprovante, não ver a chave inteira numa tela que fica aberta
 * o dia todo.
 */
function mascararChave(chave: string): string {
  if (chave.length <= 6) return `••••${chave.slice(-2)}`;
  return `${chave.slice(0, 3)}••••${chave.slice(-4)}`;
}

export default async function AdminRepassesPage() {
  const [repasses, totais] = await Promise.all([
    prisma.payout.findMany({
      orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
      take: 100,
      include: {
        provider: {
          select: { displayName: true, user: { select: { email: true } } },
        },
      },
    }),
    prisma.payout.groupBy({
      by: ["status"],
      _count: true,
      _sum: { amountCents: true },
    }),
  ]);

  const naFila = totais
    .filter((t) => t.status === "REQUESTED" || t.status === "PROCESSING")
    .reduce((soma, t) => soma + (t._sum.amountCents ?? 0), 0);

  return (
    <div>
      <AdminHeader
        eyebrow="Financeiro"
        titulo="Repasses"
        descricao="Saques pedidos pelos profissionais. Marcar como pago registra a saída no ledger — só faça depois de confirmar a transferência no banco."
      />

      {naFila > 0 && (
        <Card className="accent-soft mb-5 border p-5">
          <p className="eyebrow">Aguardando execução</p>
          <p className="num mt-1.5 text-[1.75rem] leading-none font-extrabold text-[var(--accent-text)]">
            {formatBRL(money(naFila))}
          </p>
        </Card>
      )}

      <AdminTable
        colunas={["Profissional", "Valor", "Destino", "Status", "Solicitado", "Ações"]}
        vazio={
          repasses.length === 0 ? (
            <EmptyState
              title="Nenhum repasse"
              description="Nenhum profissional solicitou saque até agora."
            />
          ) : undefined
        }
      >
        {repasses.map((r) => {
          const meta = STATUS[r.status] ?? { rotulo: r.status, tom: "neutral" as const };
          return (
            <Linha key={r.id}>
              <Celula>
                <span className="font-medium">{r.provider.displayName}</span>
                <span className="text-muted block text-xs">{r.provider.user.email}</span>
              </Celula>
              <Celula numerica className="font-bold">
                {formatBRL(money(r.amountCents))}
              </Celula>
              <Celula className="text-secondary text-xs">
                {r.destinationType} · <span className="num">{mascararChave(r.destinationKey)}</span>
              </Celula>
              <Celula>
                <Badge tone={meta.tom}>{meta.rotulo}</Badge>
                {r.failureReason && (
                  <span className="text-muted block text-xs">{r.failureReason}</span>
                )}
              </Celula>
              <Celula numerica className="text-muted text-xs">
                {r.requestedAt.toLocaleDateString("pt-BR")}
              </Celula>
              <Celula>
                <div className="flex flex-wrap items-start gap-2">
                  {r.status === "REQUESTED" && (
                    <AdminAction
                      endpoint={`/api/admin/repasses/${r.id}`}
                      payload={{ acao: "processar" }}
                      rotulo="Processar"
                      variante="secondary"
                      exigeMotivo={false}
                    />
                  )}
                  {r.status === "PROCESSING" && (
                    <>
                      <AdminAction
                        endpoint={`/api/admin/repasses/${r.id}`}
                        payload={{ acao: "concluir" }}
                        rotulo="Marcar como pago"
                        variante="primary"
                        exigeMotivo={false}
                        confirmacao="Confirme que a transferência já saiu no banco. Isto registra a saída no ledger."
                      />
                      <AdminAction
                        endpoint={`/api/admin/repasses/${r.id}`}
                        payload={{ acao: "falhar" }}
                        rotulo="Registrar falha"
                        variante="danger"
                        confirmacao="O valor volta ao saldo disponível do profissional."
                      />
                    </>
                  )}
                </div>
              </Celula>
            </Linha>
          );
        })}
      </AdminTable>
    </div>
  );
}
