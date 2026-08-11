import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { assertOwnershipOrNotFound } from "@/server/auth/page-guards";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card, Icon } from "@/ui";
import { CheckoutPanel } from "@/ui/checkout";

export const metadata: Metadata = {
  title: "Pagamento",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await requireCustomer();
  const { orderId } = await params;

  const ordem = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: {
      provider: { select: { displayName: true, slug: true } },
      request: { include: { category: { select: { name: true } } } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!ordem) notFound();
  assertOwnershipOrNotFound(ordem.customerId, session.customerProfileId);

  const pagamento = ordem.payments[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Trilha" className="text-muted text-sm">
        <Link href={`/app/solicitacoes/${ordem.requestId}`} className="hover:underline">
          Solicitação
        </Link>
        <span aria-hidden="true"> / </span>
        <span>Pagamento</span>
      </nav>

      <div>
        <p className="eyebrow text-[var(--accent-text)]">Checkout</p>
        <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
          Pagamento do serviço
        </h1>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">

      {/* Resumo: a UI apenas representa o estado financeiro do servidor (§16) */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Resumo</h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Serviço</dt>
            <dd className="text-right">{ordem.request.category.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Profissional</dt>
            <dd className="text-right">{ordem.provider.displayName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Pedido</dt>
            <dd className="text-right font-mono text-xs">{ordem.reference}</dd>
          </div>
          <div className="border-[var(--surface-border)] mt-1 flex justify-between gap-4 border-t pt-2">
            <dt className="font-medium">Valor acordado</dt>
            <dd className="font-bold">{formatBRL(money(ordem.grossAmountCents))}</dd>
          </div>
        </dl>
      </Card>

        <CheckoutPanel
          orderId={ordem.id}
          requestId={ordem.requestId}
          amountCents={ordem.grossAmountCents}
          pagamentoExistente={
            pagamento
              ? {
                  id: pagamento.id,
                  status: pagamento.status,
                  method: pagamento.method,
                  pixQrCode: pagamento.pixQrCode,
                  pixCopyPaste: pagamento.pixCopyPaste,
                  pixExpiresAt: pagamento.pixExpiresAt?.toISOString() ?? null,
                }
              : null
          }
        />
        </div>

        {/* O que acontece depois (handoff) */}
        <aside className="min-w-0 flex-[1_1_280px] lg:max-w-[340px]">
          <Card className="p-5">
            <h2 className="eyebrow flex items-center gap-2">
              <Icon name="shield-check" className="text-[var(--accent-text)] text-base" />
              O que acontece depois
            </h2>
            <ol className="mt-4 flex flex-col gap-3.5">
              {[
                ["Pagamento confirmado", "A confirmação vem do provedor, não do navegador."],
                ["Serviço autorizado", "Só então o técnico pode agendar e executar."],
                ["Execução acompanhada", "Você vê cada etapa na linha do tempo do pedido."],
                ["Liberação ao técnico", "Após a conclusão confirmada e o prazo sem contestação."],
              ].map(([titulo, texto], i) => (
                <li key={titulo} className="flex gap-3">
                  <span className="bg-grad num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.6875rem] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.8125rem] font-semibold">{titulo}</span>
                    <span className="text-muted block text-xs leading-relaxed">{texto}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
