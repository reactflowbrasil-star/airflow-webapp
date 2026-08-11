"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Badge, Button, ButtonLink, ProgressBar } from "@/ui";
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
  precisaConfirmarConclusao: boolean;
  timeline: {
    rotulo: string;
    estado: "concluida" | "atual" | "pendente";
    quando?: string;
  }[];
}

export function OrderCard({ ordem }: { ordem: OrdemAtiva }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const painelId = `ordem-${ordem.id}`;

  async function confirmarConclusao() {
    setOcupado(true);
    setErro(null);
    try {
      const response = await fetch(
        `/api/servicos/${ordem.id}/confirmar-conclusao`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) {
        setErro(body?.error?.message ?? "Não foi possível confirmar a conclusão");
        return;
      }
      setConfirmando(false);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

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
        {ordem.precisaConfirmarConclusao ? (
          <Button size="sm" onClick={() => setConfirmando(true)}>
            Confirmar conclusão
          </Button>
        ) : ordem.precisaPagar ? (
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

      {ordem.precisaConfirmarConclusao && confirmando && (
        <div className="accent-soft mt-4 rounded-[8px] border p-4">
          <h4 className="font-bold">O serviço foi concluído corretamente?</h4>
          <p className="text-secondary mt-1 text-sm leading-relaxed">
            Confirme somente após verificar o atendimento. Esta ação inicia a
            janela de segurança para o repasse ao profissional.
          </p>
          {erro && (
            <div className="mt-3">
              <Alert tone="danger">{erro}</Alert>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={confirmarConclusao} disabled={ocupado}>
              {ocupado ? "Confirmando..." : "Sim, confirmar serviço"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmando(false);
                setErro(null);
              }}
              disabled={ocupado}
            >
              Voltar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
