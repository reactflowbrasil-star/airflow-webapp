"use client";

import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert, Avatar, ButtonLink, Icon, LiveDot } from "@/ui";

/**
 * Chat da negociação (§15).
 *
 * Duas colunas no desktop; no mobile a lista dá lugar ao painel quando há
 * conversa aberta — dividir 390px entre lista e chat não deixaria nenhum dos
 * dois utilizável.
 *
 * §15 pede que os tipos de mensagem sejam visualmente distintos: texto vira
 * bolha, evento vira faixa central. Um "pagamento confirmado" com a mesma cara
 * de um "boa tarde" faria o usuário rolar a conversa atrás do que aconteceu.
 */

export type TipoMensagem =
  | "TEXT"
  | "IMAGE"
  | "FILE"
  | "PROPOSAL"
  | "COUNTER_PROPOSAL"
  | "VALUE_ACCEPTED"
  | "PAYMENT"
  | "SCHEDULING"
  | "SERVICE_STARTED"
  | "SERVICE_COMPLETED"
  | "SYSTEM";

export interface MensagemItem {
  id: string;
  tipo: TipoMensagem;
  texto: string;
  /** ISO. Formatado no cliente para respeitar o fuso de quem lê. */
  quando: string;
  /** `true` quando a mensagem é de quem está olhando a tela. */
  minha: boolean;
}

export interface ConversaItem {
  id: string;
  nome: string;
  previa: string;
  quando: string | null;
  naoLidas: number;
  requestId: string | null;
}

/** Faixas de evento: ícone e rótulo por tipo. */
const EVENTO: Partial<Record<TipoMensagem, { icone: string; rotulo: string }>> = {
  VALUE_ACCEPTED: { icone: "handshake", rotulo: "Valor aceito" },
  PAYMENT: { icone: "shield-check", rotulo: "Pagamento" },
  SCHEDULING: { icone: "calendar-check", rotulo: "Agendamento" },
  SERVICE_STARTED: { icone: "wrench", rotulo: "Serviço iniciado" },
  SERVICE_COMPLETED: { icone: "check-circle", rotulo: "Serviço concluído" },
  SYSTEM: { icone: "info", rotulo: "Aviso" },
};

/** Propostas: bolha com destaque de valor, do lado de quem propôs. */
const PROPOSTA: Partial<Record<TipoMensagem, string>> = {
  PROPOSAL: "Proposta",
  COUNTER_PROPOSAL: "Contraproposta",
};

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataCurta(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  return mesmoDia
    ? hora(iso)
    : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Rotas variam por área (cliente em `/app`, prestador em `/pro`), então quem
 * renderiza informa os caminhos. Duplicar o componente por área faria as duas
 * telas divergirem no primeiro ajuste de bolha.
 *
 * `proposta` é uma URL já resolvida, não uma função: o servidor não consegue
 * passar função para componente de cliente, e ele já sabe qual conversa está
 * ativa — montar o caminho lá é mais simples do que aqui.
 */
export interface RotasChat {
  /** Índice das conversas — recebe `?c=<id>`. */
  lista: string;
  /** Detalhe da negociação da conversa ativa, ou `null` se não houver. */
  proposta: string | null;
}

export function Chat({
  conversas,
  ativa,
  mensagens,
  tituloAtivo,
  rotas,
}: {
  conversas: ConversaItem[];
  ativa: string | null;
  mensagens: MensagemItem[];
  tituloAtivo: string | null;
  rotas: RotasChat;
}) {
  return (
    <div className="flex flex-wrap items-start gap-5">
      <ListaConversas conversas={conversas} ativa={ativa} rotas={rotas} />
      {ativa && tituloAtivo ? (
        <PainelChat
          conversationId={ativa}
          titulo={tituloAtivo}
          mensagens={mensagens}
          rotas={rotas}
        />
      ) : (
        // No mobile a lista já ocupa a tela inteira; o convite só faz sentido
        // onde as duas colunas cabem lado a lado.
        <div className="surface-card hidden min-w-0 flex-[1_1_440px] rounded-(--radius-card) p-10 text-center md:block">
          <p className="text-muted text-sm">
            Escolha uma conversa à esquerda para ver as mensagens.
          </p>
        </div>
      )}
    </div>
  );
}

function ListaConversas({
  conversas,
  ativa,
  rotas,
}: {
  conversas: ConversaItem[];
  ativa: string | null;
  rotas: RotasChat;
}) {
  return (
    <div
      className={clsx(
        "surface-card min-w-0 flex-[1_1_300px] rounded-(--radius-card) p-5 md:max-w-[400px]",
        // Com uma conversa aberta o mobile mostra só o painel.
        ativa && "max-md:hidden",
      )}
    >
      <h1 className="text-2xl font-extrabold tracking-[-0.03em]">Mensagens</h1>
      <ul className="mt-4 flex flex-col gap-2">
        {conversas.map((conversa) => {
          const selecionada = conversa.id === ativa;
          return (
            <li key={conversa.id}>
              <a
                href={`${rotas.lista}?c=${conversa.id}`}
                aria-current={selecionada ? "true" : undefined}
                className={clsx(
                  "flex w-full items-center justify-between gap-3 rounded-[16px] border p-3.5",
                  "transition-all duration-250",
                  selecionada
                    ? "accent-soft border-[var(--accent)]"
                    : "surface-muted border-transparent hover:border-[var(--accent-border)]",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={conversa.nome} size={40} />
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-[0.9rem] font-semibold tracking-[-0.02em]">
                      {conversa.nome}
                    </span>
                    <span className="text-muted mt-0.5 block truncate text-[0.78rem]">
                      {conversa.previa}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {conversa.quando && (
                    <span className="num text-muted text-[0.6875rem]">
                      {dataCurta(conversa.quando)}
                    </span>
                  )}
                  {conversa.naoLidas > 0 && (
                    <span className="bg-grad num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[0.625rem] font-bold text-white">
                      {conversa.naoLidas}
                    </span>
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PainelChat({
  conversationId,
  titulo,
  mensagens,
  rotas,
}: {
  conversationId: string;
  titulo: string;
  mensagens: MensagemItem[];
  rotas: RotasChat;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  // Conversa abre no fim, como todo chat. `instant` porque animar a rolagem
  // na montagem só mostraria ao usuário mensagens que ele já leu.
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [mensagens.length, conversationId]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/mensagens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, texto: conteudo }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível enviar a mensagem");
        return;
      }
      setTexto("");
      if (corpo.mensagem?.redigida) {
        setAviso(
          "Removemos dados de contato da sua mensagem. Combinar por fora tira " +
            "de você a proteção do pagamento e a mediação em caso de problema.",
        );
      }
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="surface-card flex min-w-0 flex-[1_1_440px] flex-col overflow-hidden rounded-(--radius-card)">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-border)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href={rotas.lista}
            aria-label="Voltar para a lista de conversas"
            className="text-secondary -ml-1 text-xl md:hidden"
          >
            <Icon name="caret-left" />
          </a>
          <Avatar name={titulo} size={40} />
          <div className="min-w-0">
            <p className="truncate font-bold tracking-[-0.02em]">{titulo}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--ok-text)]">
              <LiveDot />
              conversa ativa
            </p>
          </div>
        </div>
        {rotas.proposta && (
          <ButtonLink
            href={rotas.proposta}
            variant="secondary"
            size="sm"
            className="shrink-0"
          >
            Ver proposta
          </ButtonLink>
        )}
      </div>

      {/* Mensagens — região nomeada para que o leitor de tela possa pular
          direto para o fio, sem reler o cabeçalho a cada mensagem nova. */}
      <section
        aria-label={`Conversa com ${titulo}`}
        className="surface-muted flex max-h-[min(60vh,540px)] flex-col gap-3 overflow-y-auto p-5"
      >
        {mensagens.length === 0 ? (
          <p className="text-muted py-8 text-center text-sm">
            Nenhuma mensagem ainda. Diga oi para o técnico.
          </p>
        ) : (
          mensagens.map((mensagem) => (
            <Mensagem key={mensagem.id} mensagem={mensagem} />
          ))
        )}
        <div ref={fim} />
      </section>

      {/* Envio */}
      <form
        onSubmit={enviar}
        className="flex flex-col gap-2 border-t border-[var(--surface-border)] px-4 py-3.5"
      >
        {erro && <Alert tone="danger">{erro}</Alert>}
        {aviso && <Alert tone="warning">{aviso}</Alert>}
        <div className="flex gap-2.5">
          <label htmlFor="mensagem" className="sr-only">
            Escreva uma mensagem
          </label>
          <input
            id="mensagem"
            name="mensagem"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva uma mensagem…"
            maxLength={2000}
            autoComplete="off"
            className={clsx(
              "surface-muted min-w-0 flex-1 rounded-(--radius-pill) px-4 text-[0.9rem]",
              "h-[46px] outline-none transition-colors",
              "placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]",
            )}
          />
          <button
            type="submit"
            disabled={enviando || texto.trim().length === 0}
            aria-label="Enviar mensagem"
            className={clsx(
              "bg-grad grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full",
              "text-lg text-white transition-opacity",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
          >
            <Icon name={enviando ? "circle-notch" : "paper-plane-tilt"} />
          </button>
        </div>
        <p className="text-muted text-[0.6875rem] leading-snug">
          Combine tudo por aqui. Telefone, e-mail e WhatsApp são removidos
          automaticamente — é o que garante o pagamento protegido e a mediação.
        </p>
      </form>
    </div>
  );
}

function Mensagem({ mensagem }: { mensagem: MensagemItem }) {
  const evento = EVENTO[mensagem.tipo];
  if (evento) {
    return (
      <div className="flex justify-center">
        <div className="accent-soft flex max-w-[90%] items-start gap-2.5 rounded-[16px] border px-3.5 py-2.5">
          <Icon
            name={evento.icone}
            className="mt-0.5 shrink-0 text-base text-[var(--accent-text)]"
          />
          <p className="text-secondary text-[0.8125rem] leading-relaxed">
            <span className="font-semibold text-[var(--accent-text)]">
              {evento.rotulo}
            </span>{" "}
            · {mensagem.texto}{" "}
            <time dateTime={mensagem.quando} className="num text-muted">
              {hora(mensagem.quando)}
            </time>
          </p>
        </div>
      </div>
    );
  }

  const rotuloProposta = PROPOSTA[mensagem.tipo];

  return (
    <div className={clsx("flex", mensagem.minha ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[78%] border px-3.5 py-3",
          mensagem.minha
            ? "bg-grad rounded-[18px_18px_4px_18px] border-transparent text-white"
            : "surface-card rounded-[18px_18px_18px_4px]",
        )}
      >
        {rotuloProposta && (
          <p
            className="eyebrow mb-1 font-semibold"
            style={{
              "--eyebrow-color": mensagem.minha
                ? "rgba(255,255,255,0.92)"
                : "var(--accent-text)",
            } as React.CSSProperties}
          >
            {rotuloProposta}
          </p>
        )}
        <p className="text-sm leading-relaxed">{mensagem.texto}</p>
        <p
          className={clsx(
            "num mt-1.5 text-[0.65rem]",
            mensagem.minha ? "text-right text-white/70" : "text-muted",
          )}
        >
          {hora(mensagem.quando)}
        </p>
      </div>
    </div>
  );
}
