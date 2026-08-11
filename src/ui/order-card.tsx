"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge, ButtonLink, ProgressBar } from "@/ui";
import { ServiceTimeline } from "@/ui/negotiation";

/**
 * Card de serviço em andamento (handoff, tela 4).
 *
 * Fechado mostra a barra de progresso das 5 etapas; aberto revela a timeline
 * com datas. As etapas vêm do estado real da ordem no servidor — a barra
 * representa, não decide.
 */

export const ETAPAS_SERVICO = [
  "Aceite",
  "Pagamento",
  "Agenda",
  "Execução",
  "Liberação",
] as const;

export interface OrdemAtiva {
  id: string;
  requestId: string;
  reference: string;
  tecnico: string;
  statusRotulo: string;
  statusTom: "neutral" | "brand" | "warning" | "success";
  valorFormatado: string;
  /** Índice da etapa corrente em ETAPAS_SERVICO. */
  etapaAtual: number;
  precisaPagar: boolean;
  timeline: {
    rotulo: string;
    estado: "concluida" | "atual" | "pendente";
    quando?: string;
  }[];
}

export function OrderCard({ ordem }: { ordem: OrdemAtiva }) {
  const [aberto, setAberto] = useState(false);
  const painelId = `ordem-${ordem.id}`;

  return (
    <div
      className={`surface-card rounded-(--radius-card) p-5 shadow-(--shadow-subtle) transition-all duration-350 ${
        aberto ? "border-[var(--accent)] shadow-(--shadow-float)" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold tracking-[-0.02em]">{ordem.tecnico}</h3>
          <p className="text-muted num mt-0.5 text-[0.8125rem]">
            {ordem.reference} · {ordem.valorFormatado}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={ordem.statusTom}>{ordem.statusRotulo}</Badge>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={painelId}
            className={`accent-soft grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[var(--accent-text)] transition-transform duration-350 ${
              aberto ? "rotate-180" : ""
            }`}
          >
            <span aria-hidden="true">⌄</span>
            <span className="sr-only">
              {aberto ? "Recolher" : "Ver"} acompanhamento do pedido {ordem.reference}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar etapas={ETAPAS_SERVICO} atual={ordem.etapaAtual} />
      </div>

      {aberto && (
        <div id={painelId} className="anim-expand mt-5 border-t pt-4">
          <ServiceTimeline etapas={ordem.timeline} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {ordem.precisaPagar ? (
          <ButtonLink href={`/app/checkout/${ordem.id}`} size="sm">
            Pagar agora
          </ButtonLink>
        ) : (
          <ButtonLink
            href={`/app/solicitacoes/${ordem.requestId}`}
            size="sm"
            variant="secondary"
          >
            Acompanhar
          </ButtonLink>
        )}
        <Link
          href="/app/mensagens"
          className="text-secondary inline-flex h-9 items-center px-2 text-[0.8125rem] font-medium transition-colors hover:text-[var(--accent-text)]"
        >
          Mensagens
        </Link>
      </div>
    </div>
  );
}
