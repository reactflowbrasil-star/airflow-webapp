"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert, Button, Icon, Input } from "@/ui";

/**
 * Confirmação do código recebido no WhatsApp (§6).
 *
 * Seis campos de um dígito em vez de um campo só: no celular é o padrão que as
 * pessoas reconhecem, e o teclado numérico abre direto. Colar o código
 * preenche todos de uma vez — quem recebe por WhatsApp copia, não digita.
 *
 * A tela também é a saída de emergência do cadastro: número errado no
 * cadastro não pode prender o usuário para sempre, então há como corrigir o
 * número (e reenviar o código) e como cancelar o cadastro pendente.
 */

const DIGITOS = 6;

export function VerifyForm({
  telefone,
  jaEnviado,
  segundosParaReenviar,
  destinoAposConfirmacao = "/app",
}: {
  /** Telefone E.164 gravado na conta — usado no reenvio. */
  telefone: string | null;
  /** `true` quando já existe um código válido — não reenviamos sozinhos. */
  jaEnviado: boolean;
  segundosParaReenviar: number;
  /** Para onde ir depois do código confirmado (depende do papel). */
  destinoAposConfirmacao?: string;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<string[]>(Array(DIGITOS).fill(""));
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [espera, setEspera] = useState(segundosParaReenviar);
  const [editandoTelefone, setEditandoTelefone] = useState(false);
  const [telefoneNovo, setTelefoneNovo] = useState("");
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const campos = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const codigo = valores.join("");

  function preencher(indice: number, texto: string) {
    const digitos = texto.replace(/\D/g, "");
    if (!digitos) return;

    const novos = [...valores];
    // Colar preenche a partir daqui; digitar preenche uma casa.
    for (let i = 0; i < digitos.length && indice + i < DIGITOS; i += 1) {
      novos[indice + i] = digitos[i];
    }
    setValores(novos);

    const proximo = Math.min(indice + digitos.length, DIGITOS - 1);
    campos.current[proximo]?.focus();

    // Confirma assim que o sexto dígito entra — ninguém quer procurar o botão
    // depois de digitar o código todo. Disparado aqui, no evento, e não num
    // efeito observando o estado: o gatilho é a digitação, não a renderização.
    // `join` de casas vazias encurta a string, então o comprimento já prova
    // que todas as seis foram preenchidas. (Cuidado: `includes("")` é sempre
    // verdadeiro e não serve para testar casa vazia.)
    const completo = novos.join("");
    if (completo.length === DIGITOS) {
      void confirmar(undefined, completo);
    }
  }

  function aoTeclar(indice: number, evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Backspace") {
      evento.preventDefault();
      setValores((anteriores) => {
        const novos = [...anteriores];
        // Backspace num campo vazio volta e apaga o anterior — é o que se
        // espera de um campo de OTP.
        if (novos[indice]) novos[indice] = "";
        else if (indice > 0) {
          novos[indice - 1] = "";
          campos.current[indice - 1]?.focus();
        }
        return novos;
      });
    }
    if (evento.key === "ArrowLeft" && indice > 0) campos.current[indice - 1]?.focus();
    if (evento.key === "ArrowRight" && indice < DIGITOS - 1) {
      campos.current[indice + 1]?.focus();
    }
  }

  async function confirmar(evento?: React.FormEvent, codigoDireto?: string) {
    evento?.preventDefault();
    const aConfirmar = codigoDireto ?? codigo;
    if (aConfirmar.length !== DIGITOS || ocupado) return;

    setOcupado(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/verificacao", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codigo: aConfirmar }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível confirmar o código");
        setValores(Array(DIGITOS).fill(""));
        campos.current[0]?.focus();
        return;
      }
      router.push(destinoAposConfirmacao);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function reenviar() {
    if (espera > 0 || ocupado) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/verificacao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefone: telefone ?? "" }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível reenviar o código");
        return;
      }
      setAviso(
        corpo.entregue
          ? "Código reenviado. Confira seu WhatsApp."
          : "Não conseguimos entregar agora. Tente novamente em instantes.",
      );
      setEspera(60);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function alterarTelefone() {
    if (ocupado || !telefoneNovo.trim()) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/verificacao", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefone: telefoneNovo.trim() }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível alterar o número");
        return;
      }
      setEditandoTelefone(false);
      setTelefoneNovo("");
      setValores(Array(DIGITOS).fill(""));
      setAviso(
        corpo.entregue
          ? "Número atualizado. Enviamos um novo código para o WhatsApp."
          : "Número atualizado. Não conseguimos entregar o código agora — toque em reenviar.",
      );
      setEspera(60);
      // O número exibido na página vem do servidor; a página precisa saber.
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/verificacao", { method: "DELETE" });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo?.error?.message ?? "Não foi possível cancelar o cadastro");
        return;
      }
      // A sessão foi encerrada no servidor — voltar ao início do cadastro.
      router.push("/cadastrar");
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-5">
      {erro && <Alert tone="danger">{erro}</Alert>}
      {aviso && <Alert tone="brand">{aviso}</Alert>}

      {!jaEnviado && (
        <Alert tone="warning">
          Ainda não enviamos o código. Toque em “Enviar código” abaixo.
        </Alert>
      )}

      <div>
        <label
          htmlFor="digito-0"
          className="block text-center text-[0.8125rem] font-semibold"
        >
          Código de 6 dígitos
        </label>
        <div className="mt-3 flex justify-center gap-2" role="group">
          {valores.map((valor, i) => (
            <Input
              key={i}
              id={`digito-${i}`}
              ref={(el: HTMLInputElement | null) => {
                campos.current[i] = el;
              }}
              value={valor}
              onChange={(e) => preencher(i, e.target.value)}
              onKeyDown={(e) => aoTeclar(i, e)}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={DIGITOS}
              aria-label={`Dígito ${i + 1} de ${DIGITOS}`}
              disabled={ocupado}
              className="num h-14 w-11 px-0 text-center text-xl font-bold"
            />
          ))}
        </div>
      </div>

      <Button type="submit" disabled={codigo.length !== DIGITOS || ocupado} fullWidth>
        {ocupado ? "Confirmando…" : "Confirmar"}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={reenviar}
          disabled={espera > 0 || ocupado}
          className="text-sm font-semibold text-[var(--accent-text)] disabled:text-[var(--text-muted)]"
        >
          <Icon name="whatsapp-logo" className="mr-1.5" />
          {espera > 0
            ? `Reenviar em ${espera}s`
            : jaEnviado
              ? "Reenviar código"
              : "Enviar código"}
        </button>
      </div>

      {/* Saídas de emergência: número errado no cadastro não pode prender. */}
      <hr className="border-[var(--surface-border)]" />

      {!editandoTelefone ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setEditandoTelefone(true);
              setConfirmandoCancelamento(false);
            }}
            disabled={ocupado}
            className="text-secondary hover:text-[var(--accent-text)] text-sm font-medium transition-colors"
          >
            <Icon name="pencil-simple" className="mr-1.5" />
            O número está errado? Corrigir
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--accent-border)] p-4">
          <p className="text-sm font-semibold">Corrigir número do WhatsApp</p>
          <Input
            type="tel"
            inputMode="tel"
            value={telefoneNovo}
            onChange={(e) => setTelefoneNovo(e.target.value)}
            placeholder="(11) 98877-1200"
            aria-label="Novo número com WhatsApp"
            disabled={ocupado}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              onClick={alterarTelefone}
              disabled={ocupado || !telefoneNovo.trim()}
            >
              Alterar e reenviar código
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditandoTelefone(false);
                setTelefoneNovo("");
              }}
              disabled={ocupado}
            >
              Voltar
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        {!confirmandoCancelamento ? (
          <button
            type="button"
            onClick={() => {
              setConfirmandoCancelamento(true);
              setEditandoTelefone(false);
            }}
            disabled={ocupado}
            className="text-muted hover:text-danger-700 text-xs transition-colors"
          >
            Cancelar cadastro
          </button>
        ) : (
          <>
            <p className="text-danger-700 max-w-xs text-center text-xs leading-relaxed font-medium">
              Remover a conta pendente? O e-mail e o número ficam livres para um
              novo cadastro. Não é possível desfazer.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="danger" onClick={cancelar} disabled={ocupado}>
                {ocupado ? "Removendo…" : "Sim, cancelar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmandoCancelamento(false)}
                disabled={ocupado}
              >
                Manter cadastro
              </Button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
