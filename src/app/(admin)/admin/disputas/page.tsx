import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState } from "@/ui";
import { AdminAction } from "@/ui/admin-action";
import { AdminHeader } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Disputas" };

const STATUS: Record<string, { rotulo: string; tom: "neutral" | "success" | "warning" | "danger" }> = {
  ABERTA: { rotulo: "Aberta", tom: "danger" },
  EM_ANALISE: { rotulo: "Em análise", tom: "warning" },
  AGUARDANDO_EVIDENCIA: { rotulo: "Aguardando evidência", tom: "warning" },
  RESOLVIDA_CLIENTE: { rotulo: "Resolvida a favor do cliente", tom: "success" },
  RESOLVIDA_PRESTADOR: { rotulo: "Resolvida a favor do técnico", tom: "success" },
  RESOLVIDA_PARCIAL: { rotulo: "Resolvida parcialmente", tom: "success" },
  CANCELADA: { rotulo: "Cancelada", tom: "neutral" },
};

const MOTIVO: Record<string, string> = {
  TECNICO_NAO_COMPARECEU: "Técnico não compareceu",
  SERVICO_INCOMPLETO: "Serviço incompleto",
  EQUIPAMENTO_DANIFICADO: "Equipamento danificado",
  COBRANCA_DIVERGENTE: "Cobrança divergente",
  PROBLEMA_QUALIDADE: "Problema de qualidade",
  CANCELAMENTO: "Cancelamento",
  OUTRO: "Outro",
};

const ABERTAS = ["ABERTA", "EM_ANALISE", "AGUARDANDO_EVIDENCIA"] as const;

/**
 * Mediação de disputas (§33).
 *
 * O valor fica bloqueado enquanto a disputa corre. A resolução move dinheiro,
 * então passa pelo `resolveDispute` do serviço de domínio — que faz o
 * lançamento no ledger — e nunca por escrita direta no saldo.
 */
export default async function AdminDisputasPage() {
  const disputas = await prisma.dispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 80,
    include: {
      order: {
        select: {
          reference: true,
          grossAmountCents: true,
          providerNetAmountCents: true,
          provider: { select: { displayName: true } },
        },
      },
      customer: { include: { user: { select: { name: true } } } },
      evidences: { select: { id: true, description: true, createdAt: true } },
    },
  });

  const abertas = disputas.filter((d) => (ABERTAS as readonly string[]).includes(d.status));

  return (
    <div>
      <AdminHeader
        eyebrow="Operação"
        titulo="Disputas"
        descricao="Enquanto a disputa corre, o valor fica bloqueado. A resolução gera lançamento no ledger — o histórico não é reescrito."
      />

      {abertas.length > 0 && (
        <p className="mb-4 text-sm font-semibold text-[var(--warn-text)]">
          {abertas.length} {abertas.length === 1 ? "disputa aberta" : "disputas abertas"}
        </p>
      )}

      {disputas.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma disputa"
            description="Nenhum cliente contestou um serviço até agora."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {disputas.map((d) => {
            const meta = STATUS[d.status] ?? { rotulo: d.status, tom: "neutral" as const };
            const emAberto = (ABERTAS as readonly string[]).includes(d.status);

            return (
              <li key={d.id}>
                <Card className={`p-5 ${emAberto ? "border-[var(--warn-border)]" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="num font-bold">{d.order.reference}</h2>
                        <Badge tone={meta.tom}>{meta.rotulo}</Badge>
                        <Badge tone="neutral">{MOTIVO[d.reason] ?? d.reason}</Badge>
                      </div>
                      <p className="text-secondary mt-1 text-sm">
                        {d.customer.user.name} × {d.order.provider.displayName}
                      </p>
                    </div>
                    <p className="num text-right">
                      <span className="text-muted block text-xs">em disputa</span>
                      <span className="text-lg font-extrabold">
                        {formatBRL(money(d.order.grossAmountCents))}
                      </span>
                    </p>
                  </div>

                  <p className="text-secondary mt-3 text-sm leading-relaxed">
                    {d.description}
                  </p>

                  {d.evidences.length > 0 && (
                    <div className="surface-muted mt-3.5 rounded-[14px] p-3.5">
                      <p className="eyebrow mb-2">
                        {d.evidences.length}{" "}
                        {d.evidences.length === 1 ? "evidência" : "evidências"}
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {d.evidences.map((e) => (
                          <li key={e.id} className="text-secondary text-[0.8125rem]">
                            {e.description ?? "Anexo sem descrição"}
                            <time className="num text-muted ml-2 text-xs">
                              {e.createdAt.toLocaleDateString("pt-BR")}
                            </time>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {d.resolution && (
                    <p className="text-secondary mt-3 text-sm">
                      <span className="font-semibold">Resolução:</span> {d.resolution}
                    </p>
                  )}

                  {emAberto && (
                    <div className="mt-4 flex flex-wrap items-start gap-2">
                      {/* O vocabulário é o do serviço de domínio, não um
                          paralelo: cada opção mapeia direto para uma resolução
                          que o `resolveDispute` sabe executar no ledger. */}
                      <AdminAction
                        endpoint={`/api/admin/disputas/${d.id}`}
                        payload={{ resolucao: "REEMBOLSO_INTEGRAL" }}
                        rotulo="Reembolsar o cliente"
                        icone="arrow-u-up-left"
                        variante="danger"
                        confirmacao="O valor é estornado integralmente e o profissional não recebe por este serviço."
                      />
                      <AdminAction
                        endpoint={`/api/admin/disputas/${d.id}`}
                        payload={{ resolucao: "LIBERAR_REPASSE_INTEGRAL" }}
                        rotulo="Liberar ao técnico"
                        icone="wrench"
                        variante="primary"
                        confirmacao="O bloqueio é liberado e o profissional recebe o líquido normalmente."
                      />
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
