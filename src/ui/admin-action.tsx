"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Icon } from "@/ui";

/**
 * Botão de ação administrativa.
 *
 * Toda ação do painel pede motivo antes de executar, e o motivo vai para o
 * `AuditLog`. Não é burocracia: é o que permite, meses depois, responder por
 * que uma conta foi suspensa ou um repasse recusado — e o que distingue uma
 * decisão do operador de um acesso indevido.
 *
 * Ações destrutivas exigem, além do motivo, uma confirmação explícita.
 */
export function AdminAction({
  endpoint,
  payload,
  rotulo,
  icone,
  variante = "secondary",
  exigeMotivo = true,
  confirmacao,
  metodo = "POST",
}: {
  endpoint: string;
  payload?: Record<string, unknown>;
  rotulo: string;
  icone?: string;
  variante?: "primary" | "secondary" | "ghost" | "danger";
  /** Desligue só em ação reversível e sem efeito sobre terceiros. */
  exigeMotivo?: boolean;
  /** Texto do aviso quando a ação é destrutiva. */
  confirmacao?: string;
  metodo?: "POST" | "PATCH" | "DELETE";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function executar() {
    if (exigeMotivo && motivo.trim().length < 3) {
      setErro("Descreva o motivo — ele fica registrado na auditoria.");
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await fetch(endpoint, {
        method: metodo,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, motivo: motivo.trim() || undefined }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível concluir a ação");
        return;
      }
      setAberto(false);
      setMotivo("");
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  if (!aberto) {
    return (
      <Button size="sm" variant={variante} onClick={() => setAberto(true)}>
        {icone && <Icon name={icone} className="mr-1.5" />}
        {rotulo}
      </Button>
    );
  }

  return (
    <div className="surface-card flex min-w-[260px] flex-col gap-2 rounded-[14px] p-3">
      {confirmacao && <Alert tone="warning">{confirmacao}</Alert>}
      {erro && <Alert tone="danger">{erro}</Alert>}

      {exigeMotivo && (
        <>
          <label htmlFor={`motivo-${endpoint}`} className="sr-only">
            Motivo
          </label>
          <input
            id={`motivo-${endpoint}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (fica na auditoria)"
            autoFocus
            className="surface-muted h-10 rounded-(--radius-field) px-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant={variante} onClick={executar} disabled={ocupado}>
          {ocupado ? "Aplicando…" : `Confirmar: ${rotulo}`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setAberto(false);
            setMotivo("");
            setErro(null);
          }}
          disabled={ocupado}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
