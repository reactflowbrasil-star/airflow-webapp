"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, Badge, Button, Card, RadioDot, SelectableRow } from "@/ui";

/**
 * Checkout (§24).
 *
 * O valor exibido vem do servidor e não é editável — o componente apenas
 * representa o estado financeiro. Dados de cartão nunca passam por aqui:
 * quando o PSP real entrar, o formulário será o iframe tokenizado dele, e o
 * que chega ao nosso backend é só um token.
 */

interface PagamentoAtivo {
  id: string;
  status: string;
  method: string;
  pixQrCode?: string | null;
  pixCopyPaste?: string | null;
  pixExpiresAt?: string | null;
}

function formatar(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function CheckoutPanel({
  orderId,
  requestId,
  amountCents,
  pagamentoExistente,
}: {
  orderId: string;
  requestId: string;
  amountCents: number;
  pagamentoExistente: PagamentoAtivo | null;
}) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [pagamento, setPagamento] = useState<PagamentoAtivo | null>(pagamentoExistente);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const aguardandoConfirmacao =
    pagamento !== null && ["CREATED", "PENDING", "PROCESSING"].includes(pagamento.status);

  /**
   * Enquanto o PIX está pendente, verifica periodicamente se o webhook do PSP
   * já confirmou. A confirmação NUNCA parte do cliente — aqui só perguntamos
   * ao servidor qual é o estado atual.
   */
  useEffect(() => {
    if (!aguardandoConfirmacao) return;

    const intervalo = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(intervalo);
  }, [aguardandoConfirmacao, router]);

  async function gerarPagamento() {
    setErro(null);
    setGerando(true);
    try {
      const resposta = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, method: metodo }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível iniciar o pagamento");
        return;
      }
      setPagamento(corpo.payment);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  async function copiarCodigo() {
    if (!pagamento?.pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(pagamento.pixCopyPaste);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch {
      setErro("Não foi possível copiar. Selecione o código manualmente.");
    }
  }

  if (pagamento?.status === "PAID") {
    return (
      <Card className="p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ok-text)] text-2xl text-white">
          ✓
        </span>
        <h2 className="mt-4 text-lg font-semibold">Pagamento confirmado</h2>
        <p className="text-secondary mt-1.5 text-sm">
          O valor ficará retido na plataforma até a conclusão do serviço.
        </p>
        <Button
          className="mt-5"
          onClick={() => router.push(`/app/solicitacoes/${requestId}`)}
        >
          Acompanhar serviço
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && <Alert tone="danger">{erro}</Alert>}

      <Card className="p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">Total a pagar</h2>
          <p className="num text-[2.625rem] leading-none font-extrabold text-[var(--accent-text)]">
            {formatar(amountCents)}
          </p>
        </div>

        {!pagamento && (
          <>
            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-medium">Forma de pagamento</legend>
              <div className="flex flex-col gap-2">
                <SelectableRow selected={metodo === "PIX"}>
                  <input
                    type="radio"
                    name="metodo"
                    checked={metodo === "PIX"}
                    onChange={() => setMetodo("PIX")}
                    className="sr-only"
                  />
                  <RadioDot selected={metodo === "PIX"} />
                  <span>
                    <span className="font-medium">PIX</span>
                    <span className="text-muted block text-xs">
                      Confirmação em segundos
                    </span>
                  </span>
                </SelectableRow>

                <label className="surface-card flex cursor-not-allowed items-center gap-3.5 rounded-[18px] border p-4 opacity-60">
                  <RadioDot selected={false} />
                  <span>
                    <span className="font-medium">Cartão de crédito</span>
                    <span className="text-muted block text-xs">
                      Disponível quando a integração com o provedor de pagamento
                      estiver ativa
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <Button
              className="mt-5"
              size="lg"
              fullWidth
              onClick={gerarPagamento}
              disabled={gerando}
            >
              {gerando ? "Gerando…" : `Pagar ${formatar(amountCents)}`}
            </Button>
          </>
        )}

        {pagamento && aguardandoConfirmacao && pagamento.pixCopyPaste && (
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Badge tone="warning">Aguardando pagamento</Badge>
              {pagamento.pixExpiresAt && (
                <span className="text-muted text-xs">
                  Expira às{" "}
                  {new Date(pagamento.pixExpiresAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">PIX copia e cola</p>
              <div className="surface-muted mt-2 rounded-[14px] p-3">
                <code className="num block font-mono text-xs break-all">
                  {pagamento.pixCopyPaste}
                </code>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={copiarCodigo}
              >
                {copiado ? "Código copiado ✓" : "Copiar código PIX"}
              </Button>
            </div>

            <p className="text-muted text-xs leading-relaxed">
              Após o pagamento, a confirmação chega automaticamente pelo provedor —
              esta página se atualiza sozinha. Você não precisa confirmar nada aqui.
            </p>
          </div>
        )}

        {pagamento &&
          ["FAILED", "EXPIRED", "CANCELED"].includes(pagamento.status) && (
            <div className="mt-5">
              <Alert tone="danger" title="Pagamento não concluído">
                {pagamento.status === "EXPIRED"
                  ? "O código PIX expirou."
                  : "O pagamento não foi aprovado."}{" "}
                Você pode gerar um novo.
              </Alert>
              <Button className="mt-4" onClick={() => setPagamento(null)}>
                Tentar novamente
              </Button>
            </div>
          )}
      </Card>

      <p className="text-muted text-center text-xs leading-relaxed">
        O valor fica retido na plataforma e só é repassado ao técnico após a conclusão
        do serviço e o período de segurança sem contestação.
      </p>
    </div>
  );
}
