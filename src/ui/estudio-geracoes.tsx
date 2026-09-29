"use client";

import { ROTULO_STATUS } from "@/domain/estudio/geracao";
import type { GeracaoDTO } from "@/server/services/estudio-service";
import { Alert, Badge, Button, Card, EmptyState, Icon, IconBox, LiveDot } from "@/ui";

/**
 * Feed de gerações do Estúdio — só apresentação; o poll vive no pai.
 *
 * Falha, recusa, bloqueio e cancelamento continuam visíveis: some da tela o
 * que o admin viu gerando e ele não sabe se foi cobrado.
 */
export function ListaGeracoes({
  geracoes,
  pausadas,
  cancelando,
  errosCartao,
  onCancelar,
  onVerificar,
}: {
  geracoes: GeracaoDTO[];
  /** id → motivo de o acompanhamento automático ter parado. */
  pausadas: Readonly<Record<string, string>>;
  cancelando: Readonly<Record<string, boolean>>;
  errosCartao: Readonly<Record<string, string>>;
  onCancelar: (id: string) => void;
  onVerificar: (id: string) => void;
}) {
  if (geracoes.length === 0) {
    return (
      <EmptyState
        icon={<IconBox name="sparkle" size={52} />}
        title="Nenhuma geração ainda"
        description="Escreva um prompt e gere a primeira imagem ou vídeo de campanha. O histórico fica salvo aqui, inclusive o que falhar."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {geracoes.map((geracao) => (
        <li key={geracao.id}>
          <CartaoGeracao
            geracao={geracao}
            pausada={pausadas[geracao.id]}
            cancelando={Boolean(cancelando[geracao.id])}
            erroCartao={errosCartao[geracao.id]}
            onCancelar={onCancelar}
            onVerificar={onVerificar}
          />
        </li>
      ))}
    </ul>
  );
}

function CartaoGeracao({
  geracao,
  pausada,
  cancelando,
  erroCartao,
  onCancelar,
  onVerificar,
}: {
  geracao: GeracaoDTO;
  pausada?: string;
  cancelando: boolean;
  erroCartao?: string;
  onCancelar: (id: string) => void;
  onVerificar: (id: string) => void;
}) {
  const status = ROTULO_STATUS[geracao.status];
  const emAndamento = !geracao.terminal;

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5" data-geracao={geracao.id} data-status={geracao.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge tone={status.tom}>
            {emAndamento && !pausada && <LiveDot />}
            {status.rotulo}
          </Badge>
          <span className="text-secondary truncate text-xs font-semibold">
            <Icon name={geracao.superficie === "VIDEO" ? "film-strip" : "image"} className="mr-1" />
            {geracao.rotuloModelo}
          </span>
        </div>
        <span className="text-muted text-xs">{geracao.criadaEmTexto}</span>
      </div>

      <p className="line-clamp-3 text-sm leading-relaxed break-words">{geracao.prompt}</p>
      {geracao.resumo && <p className="text-muted text-xs">{geracao.resumo}</p>}

      {geracao.status === "CONCLUIDA" && geracao.urls.length > 0 && (
        <div className={geracao.urls.length > 1 ? "grid gap-2 sm:grid-cols-2" : "flex flex-col gap-2"}>
          {geracao.urls.map((url, indice) =>
            geracao.superficie === "VIDEO" ? (
              <video
                key={url}
                src={url}
                controls
                playsInline
                preload="metadata"
                className="max-h-[520px] w-full rounded-[14px] bg-black"
              />
            ) : (
              // URL da CDN da Higgsfield, sem remotePatterns no next/image: <img> direto.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`Imagem gerada ${indice + 1}: ${geracao.prompt.slice(0, 120)}`}
                loading="lazy"
                decoding="async"
                className="max-h-[520px] w-full rounded-[14px] border border-[var(--surface-border)] bg-[var(--surface-muted)] object-contain"
              />
            ),
          )}
        </div>
      )}

      {emAndamento && (
        <p className="text-secondary flex items-center gap-2 text-xs" role="status">
          <Icon name="hourglass-medium" />
          {pausada ??
            (geracao.status === "ENVIANDO"
              ? "Enviando à Higgsfield…"
              : geracao.status === "NA_FILA"
                ? "Na fila da Higgsfield. Acompanhando automaticamente."
                : "Gerando. Vídeo pode levar alguns minutos.")}
        </p>
      )}

      {geracao.erro && (
        <Alert tone={geracao.status === "CANCELADA" || geracao.status === "INDETERMINADA" ? "warning" : "danger"}>
          {geracao.erro}
        </Alert>
      )}
      {erroCartao && <Alert tone="danger">{erroCartao}</Alert>}

      <div className="flex flex-wrap gap-2">
        {geracao.status === "CONCLUIDA" &&
          geracao.urls.map((url, indice) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="surface-card inline-flex h-9 items-center gap-1.5 rounded-(--radius-pill) border border-[var(--surface-border)] px-4 text-[0.8125rem] font-semibold transition-colors hover:border-[var(--accent)]"
            >
              <Icon name="arrow-square-out" />
              {geracao.urls.length > 1 ? `Abrir original ${indice + 1}` : "Abrir original"}
            </a>
          ))}
        {geracao.podeCancelar && (
          <Button variant="secondary" size="sm" onClick={() => onCancelar(geracao.id)} disabled={cancelando}>
            <Icon name="stop-circle" />
            {cancelando ? "Cancelando…" : "Cancelar geração"}
          </Button>
        )}
        {emAndamento && pausada && (
          <Button variant="ghost" size="sm" onClick={() => onVerificar(geracao.id)}>
            <Icon name="arrows-clockwise" />
            Verificar agora
          </Button>
        )}
      </div>
    </Card>
  );
}
