import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatBRL, money } from "@/domain/shared/money";
import { montarTimelineServico } from "@/lib/service-timeline";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, ButtonLink, Card, Icon } from "@/ui";
import { ConfirmCompletion } from "@/ui/confirm-completion";
import { OrderLiveStream } from "@/ui/order-live-stream";
import { ReviewForm } from "@/ui/review-form";
import { ServiceTimeline } from "@/ui/negotiation";

export const metadata: Metadata = { title: "Acompanhamento do pedido" };

const STATUS_ORDEM: Record<string, { rotulo: string; tom: "neutral" | "brand" | "warning" | "success" }> = {
  AGUARDANDO_PAGAMENTO: { rotulo: "Aguardando pagamento", tom: "warning" },
  PAGA: { rotulo: "Pagamento confirmado", tom: "success" },
  AUTORIZADA: { rotulo: "Agendado", tom: "brand" },
  EM_EXECUCAO: { rotulo: "Em andamento", tom: "brand" },
  CONCLUIDA: { rotulo: "Concluído", tom: "success" },
  LIQUIDADA: { rotulo: "Repasse concluído", tom: "success" },
  CANCELADA: { rotulo: "Cancelado", tom: "neutral" },
  EM_DISPUTA: { rotulo: "Em disputa", tom: "warning" },
};

const EQUIPAMENTO: Record<string, string> = {
  SPLIT: "Split",
  INVERTER: "Inverter",
  JANELA: "Janela",
  CASSETE: "Cassete",
  PISO_TETO: "Piso-teto",
  MULTI_SPLIT: "Multi Split",
  OUTRO: "Outro",
};

function dataHora(data: Date | null | undefined): string {
  if (!data) return "";
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface FotoRegistro {
  id: string;
  rotulo: string;
  dataUrl: string;
  quando: Date;
}

export default async function AcompanharPedidoPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await requireCustomer();
  const { orderId } = await params;

  const ordem = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, customerId: session.customerProfileId },
    include: {
      request: {
        include: {
          category: { select: { name: true } },
          address: true,
        },
      },
      provider: { select: { displayName: true } },
      appointment: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      review: { select: { id: true, rating: true, comment: true, createdAt: true } },
    },
  });
  // Posse na própria consulta: pedido alheio responde 404 (invariante §9).
  if (!ordem) notFound();

  const conversa = await prisma.conversation.findUnique({
    where: {
      requestId_customerId_providerId: {
        requestId: ordem.requestId,
        customerId: ordem.customerId,
        providerId: ordem.providerId,
      },
    },
    include: {
      messages: {
        where: { type: { in: ["SYSTEM", "IMAGE"] } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          content: true,
          metadata: true,
          attachmentUrl: true,
          createdAt: true,
        },
      },
    },
  });

  const mensagens = conversa?.messages ?? [];
  const chegada = mensagens.find(
    (mensagem) =>
      typeof mensagem.metadata === "object" &&
      mensagem.metadata !== null &&
      (mensagem.metadata as Record<string, unknown>).kind === "provider_arrived",
  );
  const fotosRegistradas: FotoRegistro[] = mensagens
    .filter((mensagem) => mensagem.type === "IMAGE" && mensagem.attachmentUrl)
    .map((mensagem) => ({
      id: mensagem.id,
      rotulo: mensagem.content ?? "Foto",
      dataUrl: mensagem.attachmentUrl!,
      quando: mensagem.createdAt,
    }));

  const pagamento = ordem.payments[0] ?? null;
  const s = ordem.status;
  const pago = ["PAGA", "AUTORIZADA", "EM_EXECUCAO", "CONCLUIDA", "LIQUIDADA"].includes(s);
  const confirmacaoPendente =
    s === "EM_EXECUCAO" && ordem.appointment?.status === "CONCLUIDO";
  const podeAvaliar = ["CONCLUIDA", "LIQUIDADA"].includes(s);

  const etapas = montarTimelineServico({
    aceiteEm: ordem.createdAt,
    pagoEm: pagamento?.paidAt ?? null,
    agendadoEm: ordem.appointment?.scheduledAt ?? null,
    enRouteEm: ordem.appointment?.enRouteAt ?? null,
    chegouEm: chegada?.createdAt ?? null,
    iniciadoEm: ordem.appointment?.startedAt ?? null,
    concluidoEm: ordem.completedAt,
    liberadoEm: ordem.releasedAt,
    statusOrdem: s,
    statusAgendamento: ordem.appointment?.status ?? "AGUARDANDO",
    temAvaliacao: ordem.review !== null,
    pagamentoPendente: s === "AGUARDANDO_PAGAMENTO",
    confirmacaoPendente,
  });

  const meta = STATUS_ORDEM[s] ?? { rotulo: s, tom: "neutral" as const };
  const endereco = ordem.request.address;

  return (
    <div className="flex flex-col gap-6">
      {/* Tempo real: o servidor avisa quando a jornada muda e a página relê. */}
      <OrderLiveStream url={`/api/cliente/pedidos/${ordem.id}/stream`} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-[var(--accent-text)]">Acompanhamento</p>
          <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
            {ordem.reference}
          </h1>
          <p className="text-secondary mt-1 text-sm">
            {ordem.request.category.name} · {ordem.provider.displayName}
          </p>
        </div>
        <Badge tone={meta.tom}>{meta.rotulo}</Badge>
      </div>

      {/* Próxima ação do cliente */}
      {(s === "AGUARDANDO_PAGAMENTO" || confirmacaoPendente) && (
        <Card className="accent-soft border p-5">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
            <Icon name="cursor-click" className="text-[var(--accent-text)] text-lg" />
            {confirmacaoPendente ? "Confirmação pendente" : "Pagamento pendente"}
          </h2>
          <p className="text-secondary mt-2 text-sm leading-relaxed">
            {confirmacaoPendente
              ? "O profissional informou que o serviço terminou. Revise o resumo e as fotos abaixo e confirme a conclusão para iniciar a janela de segurança do repasse."
              : `O valor de ${formatBRL(money(ordem.grossAmountCents))} fica retido na plataforma até o serviço ser concluído e confirmado.`}
          </p>
          <div className="mt-4">
            {confirmacaoPendente ? (
              <ConfirmCompletion orderId={ordem.id} />
            ) : (
              <ButtonLink href={`/app/checkout/${ordem.id}`}>Pagar agora</ButtonLink>
            )}
          </div>
        </Card>
      )}

      {/* Timeline da jornada */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="map-trifold" className="text-[var(--accent-text)] text-lg" />
          Jornada do atendimento
        </h2>
        <div className="mt-5">
          <ServiceTimeline etapas={etapas} />
        </div>
      </Card>

      {/* Pagamento */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="shield-check" className="text-[var(--accent-text)] text-lg" />
          Pagamento
        </h2>
        <dl className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-secondary text-sm">Valor final do serviço</dt>
            <dd className="num text-lg font-extrabold">
              {formatBRL(money(ordem.grossAmountCents))}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-secondary text-sm">Status</dt>
            <dd className="text-sm font-semibold">
              {pago
                ? "Retido em escrow até a conclusão ser confirmada"
                : s === "AGUARDANDO_PAGAMENTO"
                  ? "Aguardando pagamento via PIX"
                  : "Cancelado"}
            </dd>
          </div>
        </dl>
        {!pago && s === "AGUARDANDO_PAGAMENTO" && (
          <ButtonLink href={`/app/checkout/${ordem.id}`} className="mt-4">
            Pagar com PIX
          </ButtonLink>
        )}
      </Card>

      {/* Registro fotográfico */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="camera" className="text-[var(--accent-text)] text-lg" />
          Registro fotográfico
        </h2>
        {fotosRegistradas.length === 0 ? (
          <p className="text-muted mt-3 text-sm">
            {ordem.status === "EM_EXECUCAO" || confirmacaoPendente
              ? "As fotos do serviço aparecem aqui assim que o profissional registrar."
              : "Nenhuma foto registrada para este serviço."}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {fotosRegistradas.map((foto) => (
              <li key={foto.id} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={foto.dataUrl}
                  alt={`Foto do serviço — ${foto.rotulo}`}
                  className="aspect-square w-full rounded-(--radius-field) border border-[var(--surface-border)] object-cover"
                  loading="lazy"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-secondary text-xs font-semibold">{foto.rotulo}</span>
                  <time className="num text-muted text-xs">{dataHora(foto.quando)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Resumo do serviço */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="file-text" className="text-[var(--accent-text)] text-lg" />
          Resumo do serviço
        </h2>
        <dl className="mt-4 grid gap-3 text-sm [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          <div>
            <dt className="eyebrow">Serviço</dt>
            <dd className="mt-1 font-semibold">{ordem.request.category.name}</dd>
          </div>
          <div>
            <dt className="eyebrow">Equipamento</dt>
            <dd className="mt-1 font-semibold">
              {ordem.request.quantity}× {EQUIPAMENTO[ordem.request.equipmentType] ?? ordem.request.equipmentType}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Local</dt>
            <dd className="text-secondary mt-1 leading-relaxed">
              {endereco.street}, {endereco.number}
              {endereco.complement ? ` — ${endereco.complement}` : ""}
              <br />
              {endereco.neighborhood}, {endereco.cityName} — {endereco.state}
            </dd>
          </div>
          {ordem.appointment && (
            <div>
              <dt className="eyebrow">Atendimento</dt>
              <dd className="num mt-1 font-semibold">
                {dataHora(ordem.appointment.scheduledAt)}
              </dd>
            </div>
          )}
          {ordem.completedAt && (
            <div>
              <dt className="eyebrow">Concluído em</dt>
              <dd className="num mt-1 font-semibold">{dataHora(ordem.completedAt)}</dd>
            </div>
          )}
        </dl>
        <p className="text-secondary mt-4 text-sm leading-relaxed">
          {ordem.request.description}
        </p>
      </Card>

      {/* Avaliação */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="star" className="text-[var(--accent-text)] text-lg" />
          Avalie o atendimento
        </h2>
        {ordem.review ? (
          <div className="mt-3">
            <p className="text-lg" aria-label={`Nota ${ordem.review.rating} de 5`}>
              {"★".repeat(ordem.review.rating)}
              <span className="text-muted">{"★".repeat(5 - ordem.review.rating)}</span>
            </p>
            {ordem.review.comment && (
              <p className="text-secondary mt-2 text-sm leading-relaxed">
                “{ordem.review.comment}”
              </p>
            )}
            <p className="text-muted mt-2 text-xs">Obrigado pela sua avaliação!</p>
          </div>
        ) : podeAvaliar ? (
          <div className="mt-4">
            <ReviewForm orderId={ordem.id} />
          </div>
        ) : (
          <p className="text-muted mt-3 text-sm">
            A avaliação fica disponível depois que o serviço for concluído.
          </p>
        )}
      </Card>

      <Link
        href="/app/mensagens"
        className="text-secondary inline-flex items-center gap-2 self-start text-sm font-semibold transition-colors hover:text-[var(--accent-text)]"
      >
        <Icon name="chat-circle" className="text-base" />
        Abrir conversa com o profissional →
      </Link>
    </div>
  );
}
