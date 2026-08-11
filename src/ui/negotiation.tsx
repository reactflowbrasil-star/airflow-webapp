"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Badge, Button, Card, Field, Input } from "@/ui";

/**
 * Painel de negociação (§14).
 *
 * O histórico é imutável e visível para as duas partes: cada proposta mostra
 * autor, valor e horário. Depois do aceite, o valor trava — não há campo para
 * alterar o preço contratado por aqui.
 */

export interface PropostaItem {
  id: string;
  author: "CLIENTE" | "PRESTADOR";
  amountCents: number;
  message: string | null;
  status: string;
  version: number;
  createdAt: string;
  providerId: string;
  providerName: string;
  providerSlug: string;
}

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

export function NegotiationPanel({
  requestId,
  propostas,
  encerrada,
}: {
  requestId: string;
  propostas: PropostaItem[];
  encerrada: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [contraproposta, setContraproposta] = useState<string | null>(null);
  const [valor, setValor] = useState("");

  // Agrupa por técnico: cada um tem sua própria linha de negociação
  const porTecnico = new Map<string, PropostaItem[]>();
  for (const p of propostas) {
    const lista = porTecnico.get(p.providerId) ?? [];
    lista.push(p);
    porTecnico.set(p.providerId, lista);
  }

  async function aceitar(proposalId: string) {
    setErro(null);
    setOcupado(true);
    try {
      const resposta = await fetch(`/api/propostas/${proposalId}/aceitar`, {
        method: "POST",
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível aceitar a proposta");
        return;
      }
      router.push(`/app/checkout/${corpo.order.id}`);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function enviarContraproposta(providerId: string) {
    const cents = parseValor(valor);
    if (cents === null) {
      setErro("Informe um valor válido");
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      const resposta = await fetch("/api/propostas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, providerId, amountCents: cents }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível enviar a contraproposta");
        return;
      }
      setContraproposta(null);
      setValor("");
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  if (propostas.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-secondary text-sm">
          Nenhuma proposta ainda. Assim que um técnico responder, a negociação
          aparece aqui.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && <Alert tone="danger">{erro}</Alert>}

      {[...porTecnico.entries()].map(([providerId, historico]) => {
        const ordenado = [...historico].sort((a, b) => a.version - b.version);
        const ultima = ordenado[ordenado.length - 1];
        const nome = ultima.providerName;

        // O cliente só age quando a última palavra foi do técnico
        const aguardandoCliente =
          ultima.author === "PRESTADOR" &&
          (ultima.status === "ENVIADA" || ultima.status === "CONTRAPROPOSTA");
        const aceita = ordenado.some((p) => p.status === "ACEITA");

        return (
          <Card key={providerId} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">{nome}</h3>
              {aceita ? (
                <Badge tone="success">Valor acordado</Badge>
              ) : aguardandoCliente ? (
                <Badge tone="warning">Aguardando sua resposta</Badge>
              ) : (
                <Badge tone="neutral">Aguardando o técnico</Badge>
              )}
            </div>

            {/* Histórico da negociação */}
            <ol className="mt-4 flex flex-col gap-2">
              {ordenado.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-(--radius-field) px-3.5 py-2.5 text-sm ${
                    p.author === "CLIENTE"
                      ? "bg-brand-50 dark:bg-brand-950"
                      : "bg-[var(--surface-muted)]"
                  }`}
                >
                  <span>
                    <span className="font-medium">
                      {p.author === "CLIENTE" ? "Você" : nome}
                    </span>
                    {p.message && (
                      <span className="text-secondary block text-xs">{p.message}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold">{formatar(p.amountCents)}</span>
                    <time
                      dateTime={p.createdAt}
                      className="text-muted shrink-0 text-xs"
                    >
                      {new Date(p.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </time>
                  </span>
                </li>
              ))}
            </ol>

            {!encerrada && aguardandoCliente && (
              <div className="mt-4">
                {contraproposta === providerId ? (
                  <div className="flex flex-col gap-3">
                    <Field label="Seu novo valor" htmlFor={`valor-${providerId}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary">R$</span>
                        <Input
                          id={`valor-${providerId}`}
                          inputMode="decimal"
                          value={valor}
                          onChange={(e) => setValor(e.target.value)}
                          placeholder="280,00"
                          autoFocus
                        />
                      </div>
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => enviarContraproposta(providerId)}
                        disabled={ocupado}
                        size="sm"
                      >
                        Enviar contraproposta
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setContraproposta(null);
                          setValor("");
                        }}
                        disabled={ocupado}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => aceitar(ultima.id)} disabled={ocupado}>
                      Aceitar {formatar(ultima.amountCents)}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setContraproposta(providerId);
                        setValor("");
                      }}
                      disabled={ocupado}
                    >
                      Fazer contraproposta
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** Timeline de acompanhamento (§35). */
export function ServiceTimeline({
  etapas,
}: {
  etapas: { rotulo: string; estado: "concluida" | "atual" | "pendente"; quando?: string }[];
}) {
  return (
    <ol className="flex flex-col">
      {etapas.map((etapa, i) => (
        <li key={etapa.rotulo} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                etapa.estado === "concluida"
                  ? "bg-success-500 text-white"
                  : etapa.estado === "atual"
                    ? "bg-brand-600 text-white"
                    : "bg-[var(--surface-border)] text-[var(--text-muted)]"
              }`}
            >
              {etapa.estado === "concluida" ? "✓" : etapa.estado === "atual" ? "●" : "○"}
            </span>
            {i < etapas.length - 1 && (
              <span
                aria-hidden="true"
                className={`w-px flex-1 ${
                  etapa.estado === "concluida"
                    ? "bg-success-500"
                    : "bg-[var(--surface-border)]"
                }`}
              />
            )}
          </div>
          <div className={`pb-5 ${etapa.estado === "pendente" ? "text-muted" : ""}`}>
            <p className={etapa.estado === "atual" ? "font-semibold" : "font-medium"}>
              {etapa.rotulo}
            </p>
            {etapa.quando && (
              <p className="text-muted mt-0.5 text-xs">{etapa.quando}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
