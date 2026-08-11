import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { assertOwnershipOrNotFound } from "@/server/auth/page-guards";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, ButtonLink, Card } from "@/ui";
import { NegotiationPanel, ServiceTimeline } from "@/ui/negotiation";

export const metadata: Metadata = { title: "Solicitação" };

const EQUIPAMENTO: Record<string, string> = {
  SPLIT: "Split",
  INVERTER: "Inverter",
  JANELA: "Janela",
  CASSETE: "Cassete",
  PISO_TETO: "Piso-teto",
  MULTI_SPLIT: "Multi Split",
  OUTRO: "Outro",
};

const URGENCIA: Record<string, string> = {
  BAIXA: "Sem pressa",
  NORMAL: "Nos próximos dias",
  ALTA: "Esta semana",
  EMERGENCIA: "Urgente",
};

function dataHora(valor: Date | null | undefined): string | undefined {
  if (!valor) return undefined;
  return new Date(valor).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function SolicitacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireCustomer();
  const { id } = await params;

  const solicitacao = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      category: true,
      address: true,
      proposals: {
        orderBy: { version: "asc" },
        include: { provider: { select: { displayName: true, slug: true } } },
      },
      order: {
        include: {
          provider: { select: { displayName: true, slug: true } },
          appointment: true,
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
          review: { select: { id: true } },
        },
      },
    },
  });

  if (!solicitacao) notFound();
  // Segunda camada de autorização: papel não basta, o recurso tem de ser dele.
  // 404 em vez de 403 para não confirmar a existência de ids alheios.
  assertOwnershipOrNotFound(solicitacao.customerId, session.customerProfileId);

  const ordem = solicitacao.order;
  const pagamento = ordem?.payments[0] ?? null;

  // Timeline (§35) derivada do estado real da ordem
  const etapas: {
    rotulo: string;
    estado: "concluida" | "atual" | "pendente";
    quando?: string;
  }[] = [];

  if (ordem) {
    const s = ordem.status;
    const pago = ["PAGA", "AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA"].includes(s);
    const agendado = ["AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA"].includes(s);
    const emExecucao = ["EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA"].includes(s);
    const concluido = ["CONCLUIDA", "LIQUIDADA"].includes(s);
    const liberado = s === "LIQUIDADA";

    etapas.push(
      { rotulo: "Solicitação criada", estado: "concluida", quando: dataHora(solicitacao.createdAt) },
      { rotulo: "Proposta aceita", estado: "concluida", quando: dataHora(ordem.createdAt) },
      {
        rotulo: "Pagamento aprovado",
        estado: pago ? "concluida" : "atual",
        quando: dataHora(pagamento?.paidAt),
      },
      {
        rotulo: "Serviço agendado",
        estado: agendado ? "concluida" : pago ? "atual" : "pendente",
        quando: dataHora(ordem.appointment?.scheduledAt),
      },
      {
        rotulo: "Técnico a caminho",
        estado: emExecucao ? "concluida" : agendado ? "atual" : "pendente",
        quando: dataHora(ordem.appointment?.enRouteAt),
      },
      {
        rotulo: "Serviço concluído",
        estado: concluido ? "concluida" : emExecucao ? "atual" : "pendente",
        quando: dataHora(ordem.completedAt),
      },
      {
        rotulo: "Pagamento liberado ao técnico",
        estado: liberado ? "concluida" : concluido ? "atual" : "pendente",
        quando: dataHora(ordem.releasedAt),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Trilha" className="text-muted text-sm">
        <Link href="/app" className="hover:underline">
          Início
        </Link>
        <span aria-hidden="true"> / </span>
        <span>Solicitação</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-[var(--accent-text)]">Solicitação</p>
          <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
            {solicitacao.category.name}
          </h1>
          <p className="text-muted num mt-1.5 text-sm">
            Criada em {new Date(solicitacao.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <Badge tone={solicitacao.status === "CONTRATADA" ? "success" : "warning"}>
          {solicitacao.status === "CONTRATADA"
            ? "Contratada"
            : solicitacao.status === "EM_NEGOCIACAO"
              ? "Em negociação"
              : "Aguardando propostas"}
        </Badge>
      </div>

      {/* Pagamento pendente é a ação mais urgente da tela */}
      {ordem?.status === "AGUARDANDO_PAGAMENTO" && (
        <Card className="border-[var(--warn-border)] bg-[var(--warn-soft)] p-5">
          <h2 className="font-semibold">Valor acordado — falta pagar</h2>
          <p className="text-secondary mt-1 text-sm">
            {ordem.provider.displayName} aceitou o valor de{" "}
            <strong>{formatBRL(money(ordem.grossAmountCents))}</strong>. O serviço só é
            autorizado após a confirmação do pagamento.
          </p>
          <ButtonLink href={`/app/checkout/${ordem.id}`} className="mt-4">
            Pagar {formatBRL(money(ordem.grossAmountCents))}
          </ButtonLink>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          {/* Negociação */}
          <section>
            <h2 className="mb-3.5 text-lg font-bold tracking-[-0.02em]">Propostas</h2>
            <NegotiationPanel
              requestId={solicitacao.id}
              encerrada={solicitacao.status === "CONTRATADA"}
              propostas={solicitacao.proposals.map((p) => ({
                id: p.id,
                author: p.author,
                amountCents: p.amountCents,
                message: p.message,
                status: p.status,
                version: p.version,
                createdAt: p.createdAt.toISOString(),
                providerId: p.providerId,
                providerName: p.provider.displayName,
                providerSlug: p.provider.slug,
              }))}
            />
          </section>

          {/* Acompanhamento */}
          {etapas.length > 0 && (
            <section>
              <h2 className="mb-3.5 text-lg font-bold tracking-[-0.02em]">Acompanhamento</h2>
              <Card className="p-5">
                <ServiceTimeline etapas={etapas} />
              </Card>
            </section>
          )}

          {ordem?.status === "LIQUIDADA" && !ordem.review && (
            <Card className="p-5">
              <h2 className="font-semibold">Como foi o atendimento?</h2>
              <p className="text-secondary mt-1 text-sm">
                Sua avaliação ajuda outros clientes e mantém a qualidade da rede.
              </p>
              <ButtonLink href={`/app/avaliar/${ordem.id}`} className="mt-4">
                Avaliar {ordem.provider.displayName}
              </ButtonLink>
            </Card>
          )}
        </div>

        {/* Detalhes */}
        <aside>
          <Card className="p-5">
            <h2 className="eyebrow">Detalhes do pedido</h2>
            <dl className="mt-3 flex flex-col gap-2.5 text-sm">
              <Detalhe rotulo="Equipamento">
                {solicitacao.quantity}× {EQUIPAMENTO[solicitacao.equipmentType]}
                {solicitacao.btus ? ` · ${solicitacao.btus} BTUs` : ""}
              </Detalhe>
              {solicitacao.brand && (
                <Detalhe rotulo="Marca">{solicitacao.brand}</Detalhe>
              )}
              <Detalhe rotulo="Imóvel">
                {solicitacao.propertyType === "RESIDENCIAL" ? "Residencial" : "Comercial"}
              </Detalhe>
              <Detalhe rotulo="Urgência">{URGENCIA[solicitacao.urgency]}</Detalhe>
              {solicitacao.desiredDate && (
                <Detalhe rotulo="Data desejada">
                  {new Date(solicitacao.desiredDate).toLocaleDateString("pt-BR")}
                </Detalhe>
              )}
              <Detalhe rotulo="Sua proposta inicial">
                {formatBRL(money(solicitacao.proposedPriceCents))}
              </Detalhe>
              <Detalhe rotulo="Endereço">
                {solicitacao.address.street}, {solicitacao.address.number}
                <br />
                {solicitacao.address.neighborhood}, {solicitacao.address.cityName}/
                {solicitacao.address.state}
              </Detalhe>
            </dl>

            <div className="border-[var(--surface-border)] mt-4 border-t pt-4">
              <h3 className="eyebrow">Descrição</h3>
              <p className="text-secondary mt-1.5 text-sm leading-relaxed">
                {solicitacao.description}
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Detalhe({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted text-xs">{rotulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
