"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input } from "@/ui";

type Action = "SCHEDULE" | "START" | "REQUEST_COMPLETION";

const LABELS = {
  START: "Iniciar atendimento",
  REQUEST_COMPLETION: "Informar conclusão",
} as const;

export function ServiceOperation({ orderId, action }: { orderId: string; action: Action }) {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (action === "SCHEDULE" && !scheduledAt) {
      setError("Informe a data e o horário do atendimento");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/servicos/${orderId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: action,
          ...(action === "SCHEDULE"
            ? { scheduledAt: new Date(scheduledAt).toISOString() }
            : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Não foi possível atualizar o serviço");
        return;
      }
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (action === "SCHEDULE") {
    return (
      <div className="mt-4 flex flex-col gap-3 border-t border-[var(--surface-border)] pt-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Data e horário" htmlFor={`agenda-${orderId}`} required>
          <Input
            id={`agenda-${orderId}`}
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </Field>
        <Button onClick={submit} disabled={busy || !scheduledAt}>
          {busy ? "Agendando..." : "Agendar serviço"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--surface-border)] pt-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button onClick={submit} disabled={busy}>
        {busy ? "Atualizando..." : LABELS[action]}
      </Button>
    </div>
  );
}
