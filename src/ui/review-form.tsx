"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Textarea } from "@/ui";

/**
 * Avaliação do atendimento (§36) — nota com estrelas + comentário opcional.
 * Aparece na página de acompanhamento depois da conclusão confirmada.
 */

export function ReviewForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (rating < 1) {
      setErro("Selecione uma nota para o atendimento");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/avaliacoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId,
          rating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível enviar a avaliação");
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const rotulos = ["Péssimo", "Ruim", "Regular", "Bom", "Excelente"];

  return (
    <div className="flex flex-col gap-3">
      {erro && <Alert tone="danger">{erro}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="radiogroup" aria-label="Nota do atendimento">
          {[1, 2, 3, 4, 5].map((valor) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={rating === valor}
              aria-label={`${valor} de 5 — ${rotulos[valor - 1]}`}
              onClick={() => setRating(valor)}
              className={`grid h-10 w-10 place-items-center rounded-full border text-lg transition-colors ${
                valor <= rating
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                  : "text-muted hover:border-[var(--surface-border)]"
              }`}
            >
              ★
            </button>
          ))}
        </div>
        <span className="text-secondary text-sm">
          {rating > 0 ? rotulos[rating - 1] : "Toque para avaliar"}
        </span>
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        placeholder="Comentário opcional — como foi o atendimento?"
        aria-label="Comentário da avaliação"
      />
      <div>
        <Button onClick={() => void enviar()} disabled={busy || rating === 0}>
          {busy ? "Enviando..." : "Enviar avaliação"}
        </Button>
      </div>
    </div>
  );
}
