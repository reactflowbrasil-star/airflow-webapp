"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Badge, Button, Field, Input } from "@/ui";

/**
 * Solicitação compatível na área do prestador (handoff, tela 8).
 *
 * Fechado mostra o suficiente para decidir se vale abrir. Aberto revela a
 * descrição do cliente e permite enviar proposta — contraproposta ou aceite
 * do valor sugerido, tudo pela API que valida a máquina de estados.
 */

export interface Lead {
  requestId: string;
  categoria: string;
  bairro: string;
  cidade: string;
  urgencia: "BAIXA" | "NORMAL" | "ALTA" | "EMERGENCIA";
  equipamento: string;
  descricao: string;
  valorPropostoCents: number;
  criadoEm: string;
  /** Última proposta desta negociação, se o prestador já respondeu. */
  minhaUltimaPropostaCents: number | null;
  aguardandoMinhaResposta: boolean;
}

const URGENCIA_TOM = {
  BAIXA: "neutral",
  NORMAL: "neutral",
  ALTA: "warning",
  EMERGENCIA: "danger",
} as const;

const URGENCIA_ROTULO = {
  BAIXA: "Sem pressa",
  NORMAL: "Próximos dias",
  ALTA: "Esta semana",
  EMERGENCIA: "Urgente",
} as const;

function formatar(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function parseValor(texto: string): number | null {
  const limpo = texto.replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(limpo);
  if (!match) return null;
  const cents =
    Number.parseInt(match[1], 10) * 100 +
    Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10);
  return cents > 0 ? cents : null;
}

export function LeadCard({ lead, providerId }: { lead: Lead; providerId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [contra, setContra] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const painelId = `lead-${lead.requestId}`;

  async function responder(action: "ACEITAR" | "CONTRAPROPOSTA" | "RECUSAR") {
    setErro(null);
    setOcupado(true);
    try {
      if (action === "CONTRAPROPOSTA") {
        const cents = parseValor(valor);
        if (cents === null) {
          setErro("Informe um valor válido");
          return;
        }
        const res = await fetch("/api/propostas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: lead.requestId,
            providerId,
            amountCents: cents,
          }),
        });
        const corpo = await res.json();
        if (!res.ok) {
          setErro(corpo?.error?.message ?? "Não foi possível enviar a proposta");
          return;
        }
      } else {
        const res = await fetch(`/api/propostas/aceitar-por-solicitacao`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId: lead.requestId, providerId, action }),
        });
        const corpo = await res.json();
        if (!res.ok) {
          setErro(corpo?.error?.message ?? "Não foi possível responder");
          return;
        }
      }
      setContra(false);
      setValor("");
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
        aberto
          ? "-translate-y-[3px] border-[var(--accent)] shadow-(--shadow-float)"
          : lead.aguardandoMinhaResposta
            ? "border-[var(--accent-border)]"
            : "hover:border-[var(--accent-border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold tracking-[-0.02em]">{lead.categoria}</h3>
          <p className="text-muted mt-1 truncate text-[0.8125rem]">
            {lead.bairro}, {lead.cidade} · {lead.equipamento}
          </p>
        </div>
        <Badge tone={URGENCIA_TOM[lead.urgencia]}>{URGENCIA_ROTULO[lead.urgencia]}</Badge>
      </div>

      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Valor proposto pelo cliente</p>
          <p className="num mt-1 text-[1.375rem] font-extrabold text-[var(--accent-text)]">
            {formatar(lead.valorPropostoCents)}
          </p>
          {lead.minhaUltimaPropostaCents !== null && (
            <p className="num text-muted mt-1 text-xs">
              sua contraproposta: {formatar(lead.minhaUltimaPropostaCents)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={painelId}
          className={`accent-soft grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[var(--accent-text)] transition-transform duration-350 ${
            aberto ? "rotate-180" : ""
          }`}
        >
          <span aria-hidden="true">⌄</span>
          <span className="sr-only">
            {aberto ? "Recolher" : "Ver"} detalhes da solicitação
          </span>
        </button>
      </div>

      {aberto && (
        <div id={painelId} className="anim-expand mt-4 border-t pt-4">
          <p className="eyebrow">Descrição do cliente</p>
          <p className="text-secondary mt-2 text-[0.9375rem] leading-relaxed">
            {lead.descricao}
          </p>

          {erro && (
            <div className="mt-3">
              <Alert tone="danger">{erro}</Alert>
            </div>
          )}

          {lead.aguardandoMinhaResposta ? (
            contra ? (
              <div className="mt-4 flex flex-col gap-3">
                <Field label="Seu valor" htmlFor={`valor-${lead.requestId}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary font-semibold">R$</span>
                    <Input
                      id={`valor-${lead.requestId}`}
                      inputMode="decimal"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      placeholder="320,00"
                      autoFocus
                    />
                  </div>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => responder("CONTRAPROPOSTA")}
                    disabled={ocupado}
                  >
                    Enviar proposta
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setContra(false)}
                    disabled={ocupado}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => responder("ACEITAR")} disabled={ocupado}>
                  Aceitar {formatar(lead.valorPropostoCents)}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setContra(true)}>
                  Enviar proposta
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => responder("RECUSAR")}
                  disabled={ocupado}
                >
                  Dispensar
                </Button>
              </div>
            )
          ) : (
            <p className="text-muted mt-4 text-sm">
              Aguardando resposta do cliente à sua proposta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
