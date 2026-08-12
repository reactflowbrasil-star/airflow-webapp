"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button } from "@/ui";

/**
 * Cancelamento da solicitação pelo cliente (§10) — confirmação em duas etapas
 * para ninguém cancelar sem querer. O backend mantém a trava da máquina de
 * estados; aqui só se dispara o DELETE.
 */
export function CancelRequest({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/solicitacoes/${requestId}`, { method: "DELETE" });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível cancelar a solicitação");
        setConfirmando(false);
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
      setConfirmando(false);
    } finally {
      setBusy(false);
    }
  }

  if (!confirmando) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirmando(true)}>
        Cancelar solicitação
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-field) border border-[var(--warn-border)] bg-[var(--warn-soft)] p-4">
      <h4 className="font-bold">Cancelar esta solicitação?</h4>
      <p className="text-secondary text-sm leading-relaxed">
        Os prestadores notificados deixam de ver esta oportunidade. Não é
        possível desfazer.
      </p>
      {erro && <Alert tone="danger">{erro}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="danger" onClick={() => void cancelar()} disabled={busy}>
          {busy ? "Cancelando..." : "Sim, cancelar solicitação"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setConfirmando(false);
            setErro(null);
          }}
          disabled={busy}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
}
