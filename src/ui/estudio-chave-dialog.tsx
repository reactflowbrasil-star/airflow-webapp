"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert, Badge, Button, Icon } from "@/ui";

export type ModoDialogoChave = "conectar" | "gerenciar" | "substituir";

/**
 * Diálogo da chave de API da Higgsfield do Estúdio.
 *
 * Os nomes das ações ficam em inglês de propósito — "Connect API key",
 * "Manage API key", "Replace API key", "Remove API key" e o texto do modal —
 * porque são os do fluxo padrão da Higgsfield exigidos na especificação do
 * Estúdio (quem copia a chave em open.higgsfield.ai reconhece o fluxo). O
 * restante segue em pt-BR.
 *
 * A chave existe só no campo enquanto é colada: vai ao servidor num POST e o
 * estado é limpo. Nada de localStorage; o servidor nunca a devolve.
 */
export function DialogoChaveApi({
  modo,
  aviso,
  onModo,
  onFechar,
  onSalva,
  onRemovida,
}: {
  modo: ModoDialogoChave | null;
  /** Motivo de ter aberto (ex.: a Higgsfield recusou a chave atual). */
  aviso?: string | null;
  onModo: (modo: ModoDialogoChave) => void;
  onFechar: () => void;
  onSalva: () => void;
  onRemovida: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [chave, setChave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (modo && !dialogo.open) dialogo.showModal();
    if (!modo && dialogo.open) dialogo.close();
  }, [modo]);

  function limpar() {
    setChave("");
    setFalha(null);
    setConfirmarRemocao(false);
  }

  function fechar() {
    limpar();
    onFechar();
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setOcupado(true);
    setFalha(null);
    try {
      const resposta = await fetch("/api/admin/estudio/chave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: chave }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setFalha(corpo?.error?.message ?? "Não foi possível salvar a chave.");
        return;
      }
      limpar();
      onSalva();
    } catch {
      setFalha("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setOcupado(true);
    setFalha(null);
    try {
      const resposta = await fetch("/api/admin/estudio/chave", { method: "DELETE" });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setFalha(corpo?.error?.message ?? "Não foi possível remover a chave.");
        return;
      }
      limpar();
      onRemovida();
    } catch {
      setFalha("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  const titulo =
    modo === "gerenciar" ? "Manage API key" : modo === "substituir" ? "Replace API key" : "Connect API key";

  return (
    <dialog
      ref={ref}
      aria-labelledby="titulo-chave-api"
      onClose={fechar}
      className="m-auto w-[min(calc(100vw-2rem),440px)] rounded-[22px] border border-[var(--surface-border)] bg-[var(--surface-card)] p-0 text-[var(--text-primary)] shadow-(--shadow-float) backdrop:bg-[rgba(19,11,56,0.45)]"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="titulo-chave-api" className="text-lg font-bold tracking-[-0.02em]">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="text-secondary -mt-1 -mr-2 rounded-full p-2 transition-colors hover:bg-[var(--surface-muted)]"
          >
            <Icon name="x" />
          </button>
        </div>

        {aviso && <Alert tone="warning">{aviso}</Alert>}

        {modo === "gerenciar" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">
                <Icon name="check-circle" />
                API key saved
              </Badge>
            </div>
            <p className="text-secondary text-sm leading-relaxed">
              A chave está cifrada no servidor, em cookie httpOnly, e nunca volta ao navegador.
              Salvar não prova que ela é válida: a Higgsfield confirma na primeira chamada.
            </p>
            {falha && <Alert tone="danger">{falha}</Alert>}
            {confirmarRemocao ? (
              <div className="flex flex-col gap-3">
                <Alert tone="warning">
                  Gerações já enviadas continuam na Higgsfield, mas o Estúdio para de acompanhá-las até
                  uma chave ser conectada de novo.
                </Alert>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" size="sm" onClick={remover} disabled={ocupado}>
                    {ocupado ? "Removendo…" : "Confirmar: Remove API key"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmarRemocao(false)} disabled={ocupado}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onModo("substituir")}>
                  Replace API key
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmarRemocao(true)}>
                  Remove API key
                </Button>
              </div>
            )}
          </>
        ) : (
          <form onSubmit={salvar} className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed">
              Paste the API key copied from open.higgsfield.ai. Paste it as-is.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="hf-api-key" className="text-[0.8125rem] font-semibold">
                Chave de API
              </label>
              <input
                id="hf-api-key"
                name="apiKey"
                type="password"
                value={chave}
                onChange={(evento) => setChave(evento.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
                autoFocus
                className="surface-card h-12 w-full rounded-(--radius-field) border border-[var(--surface-border)] px-4 font-mono text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
              />
              <p className="text-muted text-xs leading-snug">
                Crie ou copie a chave em{" "}
                <a
                  href="https://open.higgsfield.ai/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[var(--accent-text)] underline-offset-2 hover:underline"
                >
                  open.higgsfield.ai/api-keys
                </a>
                . Ela fica cifrada no servidor e nunca é exibida de novo.
              </p>
            </div>
            {falha && <Alert tone="danger">{falha}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={ocupado || !chave.trim()}>
                {ocupado ? "Salvando…" : titulo}
              </Button>
              <Button type="button" variant="ghost" onClick={fechar} disabled={ocupado}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
