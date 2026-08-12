"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button } from "@/ui";

/**
 * Confirmação da conclusão pelo cliente (§35) — o único passo que inicia a
 * janela de segurança do repasse. Aparece na página de acompanhamento quando
 * o prestador pediu a conclusão.
 */
export function ConfirmCompletion({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/servicos/${orderId}/confirmar-conclusao`, {
        method: "POST",
      });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível confirmar a conclusão");
        return;
      }
      setConfirmando(false);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirmando) {
    return (
      <div>
        <Button size="sm" onClick={() => setConfirmando(true)}>
          Confirmar conclusão
        </Button>
      </div>
    );
  }

  return (
    <div className="accent-soft flex flex-col gap-3 rounded-(--radius-field) border p-4">
      <h4 className="font-bold">O serviço foi concluído corretamente?</h4>
      <p className="text-secondary text-sm leading-relaxed">
        Confirme somente após verificar o atendimento e as fotos registradas.
        Esta ação inicia a janela de segurança para o repasse ao profissional.
      </p>
      {erro && <Alert tone="danger">{erro}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void confirmar()} disabled={busy}>
          {busy ? "Confirmando..." : "Sim, confirmar serviço"}
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
