"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input } from "@/ui";

/**
 * Pedido de repasse.
 *
 * O formulário só propõe: quem decide é o back-end, que valida saldo
 * disponível sob lock, ausência de disputa e política antifraude. Um saque
 * recusado por risco volta como MANUAL_REVIEW e é exibido como tal.
 */
export function PayoutRequestForm({ disponivelCents }: { disponivelCents: number }) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const semSaldo = disponivelCents <= 0;

  function parseValor(texto: string): number | null {
    const limpo = texto.replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
    const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(limpo);
    if (!match) return null;
    const cents =
      Number.parseInt(match[1], 10) * 100 +
      Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10);
    return cents > 0 ? cents : null;
  }

  async function enviar() {
    const cents = parseValor(valor);
    if (cents === null) {
      setErro("Informe um valor válido");
      return;
    }
    if (cents > disponivelCents) {
      setErro("Valor acima do saldo disponível");
      return;
    }
    if (chave.trim().length < 3) {
      setErro("Informe a chave PIX de destino");
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/repasses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountCents: cents,
          destinationType: "PIX",
          destinationKey: chave.trim(),
        }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(
          corpo?.error?.code === "MANUAL_REVIEW"
            ? "Repasse retido para revisão manual pela política antifraude. Nossa equipe entrará em contato."
            : (corpo?.error?.message ?? "Não foi possível solicitar o repasse"),
        );
        return;
      }
      setOk(true);
      setValor("");
      setChave("");
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (semSaldo) {
    return (
      <p className="text-secondary mt-3 text-sm leading-relaxed">
        Você ainda não tem saldo disponível. O valor dos serviços concluídos é liberado
        após o período de segurança sem contestação.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {erro && <Alert tone="danger">{erro}</Alert>}
      {ok && <Alert tone="success">Repasse solicitado. Acompanhe pelo histórico.</Alert>}

      <Field label="Valor" htmlFor="payout-valor">
        <div className="flex items-center gap-2">
          <span className="text-secondary font-semibold">R$</span>
          <Input
            id="payout-valor"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </div>
      </Field>

      <Field label="Chave PIX" htmlFor="payout-chave">
        <Input
          id="payout-chave"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder="CPF, e-mail ou aleatória"
        />
      </Field>

      <Button onClick={enviar} disabled={enviando} fullWidth>
        {enviando ? "Solicitando…" : "Solicitar repasse"}
      </Button>
    </div>
  );
}
