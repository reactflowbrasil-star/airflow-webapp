import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { assertOwnershipOrNotFound } from "@/server/auth/page-guards";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/ui";
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
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <nav aria-label="Trilha" className="text-muted text-sm">
        <Link href={`/app/solicitacoes/${ordem.requestId}`} className="hover:underline">
          Solicitação
        </Link>
        <span aria-hidden="true"> / </span>
        <span>Pagamento</span>
      </nav>

      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
        Pagamento do serviço
      </h1>

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
  );
}
