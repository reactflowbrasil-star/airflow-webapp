import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState, Icon } from "@/ui";
import { PayoutRequestForm } from "@/ui/payout-form";

export const metadata: Metadata = { title: "Financeiro" };

const PAYOUT_STATUS: Record<
  string,
  { rotulo: string; tom: "neutral" | "brand" | "success" | "danger" }
> = {
  REQUESTED: { rotulo: "Solicitado", tom: "neutral" },
  PROCESSING: { rotulo: "Processando", tom: "brand" },
  PAID: { rotulo: "Pago", tom: "success" },
  FAILED: { rotulo: "Falhou", tom: "danger" },
  CANCELED: { rotulo: "Cancelado", tom: "neutral" },
};

export default async function FinanceiroPage() {
  const session = await requireProvider();
  const providerId = session.providerProfileId;

  const [saldo, repasses, ordens] = await Promise.all([
    prisma.providerBalance.findUnique({ where: { providerId } }),
    prisma.payout.findMany({
      where: { providerId },
      orderBy: { requestedAt: "desc" },
      take: 20,
    }),
    prisma.marketplaceOrder.findMany({
      where: { providerId, status: { in: ["CONCLUIDA", "LIQUIDADA"] } },
      orderBy: { completedAt: "desc" },
      take: 10,
      include: { request: { include: { category: { select: { name: true } } } } },
    }),
  ]);

  const disponivel = saldo?.availableCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-[var(--accent-text)]">Financeiro</p>
        <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
          Saldo e repasses
        </h1>
      </div>

      {/* Saldos segregados — espelham exatamente o estado do servidor (§22) */}
      <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <SaldoCard
          rotulo="Disponível"
          valor={disponivel}
          destaque
          nota="Pronto para saque"
        />
        <SaldoCard
          rotulo="Retido"
          valor={saldo?.pendingCents ?? 0}
          nota="Aguardando janela de segurança"
        />
        <SaldoCard
          rotulo="Bloqueado"
          valor={saldo?.blockedCents ?? 0}
          nota="Disputa em análise"
        />
        <SaldoCard
          rotulo="Em repasse"
          valor={saldo?.inTransitCents ?? 0}
          nota="A caminho da sua conta"
        />
      </dl>

      <div className="flex flex-wrap gap-6">
        <section className="min-w-0 flex-[1_1_420px]">
          <h2 className="mb-3.5 text-lg font-bold tracking-[-0.02em]">
            Histórico de repasses
          </h2>

          {repasses.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhum repasse ainda"
                description="Quando você solicitar um saque do saldo disponível, o histórico aparece aqui com valor, destino e status."
              />
            </Card>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {repasses.map((repasse) => {
                const estado = PAYOUT_STATUS[repasse.status] ?? {
                  rotulo: repasse.status,
                  tom: "neutral" as const,
                };
                return (
                  <li key={repasse.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="num font-bold">
                          {formatBRL(money(repasse.amountCents))}
                        </p>
                        <p className="text-muted num mt-0.5 text-xs">
                          {repasse.requestedAt.toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}{" "}
                          · {repasse.destinationType}
                        </p>
                      </div>
                      <Badge tone={estado.tom}>{estado.rotulo}</Badge>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="mt-8 mb-3.5 text-lg font-bold tracking-[-0.02em]">
            Serviços liquidados
          </h2>
          {ordens.length === 0 ? (
            <p className="text-muted text-sm">Nenhum serviço concluído ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {ordens.map((ordem) => (
                <li key={ordem.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{ordem.request.category.name}</p>
                        <p className="text-muted num mt-0.5 text-xs">
                          {ordem.reference}
                        </p>
                      </div>
                      <dl className="text-right text-xs">
                        <div className="flex gap-3">
                          <dt className="text-muted">Bruto</dt>
                          <dd className="num font-medium">
                            {formatBRL(money(ordem.grossAmountCents))}
                          </dd>
                        </div>
                        <div className="flex gap-3">
                          <dt className="text-muted">Comissão</dt>
                          <dd className="num font-medium">
                            −{formatBRL(money(ordem.commissionAmountCents))}
                          </dd>
                        </div>
                        <div className="mt-1 flex gap-3 border-t pt-1">
                          <dt className="font-semibold">Líquido</dt>
                          <dd className="num font-bold text-[var(--accent-text)]">
                            {formatBRL(money(ordem.providerNetAmountCents))}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="min-w-0 flex-[1_1_280px] lg:max-w-[360px]">
          <Card className="accent-soft border p-5">
            <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
              <Icon name="paper-plane-tilt" className="text-[var(--accent-text)] text-lg" />
              Solicitar repasse
            </h2>
            <PayoutRequestForm disponivelCents={disponivel} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SaldoCard({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: number;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <Card className={`min-w-0 p-5 ${destaque ? "accent-soft border" : ""}`}>
      <dt className="eyebrow">{rotulo}</dt>
      <dd
        className={`num mt-2 text-[1.5rem] leading-none font-extrabold ${
          destaque ? "text-[var(--accent-text)]" : ""
        }`}
      >
        {formatBRL(money(valor))}
      </dd>
      <p className="text-muted mt-2 text-xs leading-snug">{nota}</p>
    </Card>
  );
}
