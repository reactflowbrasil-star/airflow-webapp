"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  LIMITE_PROMPT,
  LIMITE_REFERENCIAS,
  PROPORCOES_IMAGEM,
  QUALIDADES_IMAGEM,
  RESOLUCOES_IMAGEM,
  ROTULO_PROPORCAO,
  ROTULO_QUALIDADE,
  ROTULO_RESOLUCAO,
  ROTULO_STATUS,
  SUGESTOES_PROMPT,
  geracaoTerminou,
  linkDeImagemExibivel,
  tomDoStatusGeracao,
  type GeracaoImagem,
  type PaginaPresets,
  type PresetMarketing,
  type ProporcaoImagem,
  type QualidadeImagem,
  type ResolucaoImagem,
} from "@/lib/marketing-image";
import {
  Alert,
  Badge,
  Button,
  Chip,
  Field,
  Icon,
  Input,
  LiveDot,
  RadioDot,
  Select,
  SelectableRow,
  Skeleton,
  Textarea,
} from "@/ui";

/**
 * Estúdio de marketing do painel admin.
 *
 * A geração é assíncrona no provedor: o POST devolve um id e a tela consulta
 * o estado a cada poucos segundos, dentro do próprio handler do envio — nada
 * de `useEffect` disparando `setState` (regra do repositório). Sair da página
 * aborta o acompanhamento; a geração segue no provedor e o histórico mostra
 * o desfecho depois.
 */

type Modo = "gerar" | "editar" | "preset";

const MODOS: ReadonlyArray<{ id: Modo; rotulo: string; icone: string }> = [
  { id: "gerar", rotulo: "Criar do zero", icone: "magic-wand" },
  { id: "editar", rotulo: "Editar imagens", icone: "pencil-simple" },
  { id: "preset", rotulo: "Preset do Marketing Studio", icone: "sparkle" },
];

const INTERVALO_MS = 2500;
/** Mesmo teto do SDK oficial (`maxPollTime`). Passado dele, a geração segue no provedor. */
const PRAZO_MS = 5 * 60_000;

const LINK_ACAO =
  "surface-card inline-flex h-9 items-center gap-1.5 rounded-(--radius-pill) border " +
  "border-[var(--surface-border)] px-4 text-[0.8125rem] font-semibold transition-all " +
  "duration-250 hover:border-[var(--accent)]";

interface EstadoPresets {
  itens: PresetMarketing[];
  cursor: string | null;
  carregando: boolean;
  carregado: boolean;
  erro: string | null;
}

function mensagemDeErro(corpo: unknown, padrao: string): string {
  const erro = (corpo as { error?: { message?: unknown; details?: unknown } } | null)?.error;
  // Na validação, "Dados inválidos" não diz o que corrigir; o primeiro detalhe diz.
  const detalhe = Array.isArray(erro?.details)
    ? (erro.details[0] as { message?: unknown } | undefined)?.message
    : undefined;
  if (typeof detalhe === "string") return detalhe;
  return typeof erro?.message === "string" ? erro.message : padrao;
}

function esperar(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    sinal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function linhas(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
}

export function EstudioImagemMarketing({ modo: modoProvedor }: { modo: "sandbox" | "real" }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("gerar");
  const [prompt, setPrompt] = useState("");
  const [proporcao, setProporcao] = useState<ProporcaoImagem>("auto");
  const [qualidade, setQualidade] = useState<QualidadeImagem>("high");
  const [resolucao, setResolucao] = useState<ResolucaoImagem>("2k");
  const [referencias, setReferencias] = useState("");
  const [produto, setProduto] = useState("");
  const [modelo, setModelo] = useState("");
  const [presetId, setPresetId] = useState<string | null>(null);
  const [presets, setPresets] = useState<EstadoPresets>({
    itens: [],
    cursor: null,
    carregando: false,
    carregado: false,
    erro: null,
  });
  const [geracao, setGeracao] = useState<GeracaoImagem | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const acompanhamento = useRef<AbortController | null>(null);

  // Só limpeza, sem setState: sair da página encerra o polling em curso.
  useEffect(() => {
    const controle = acompanhamento;
    return () => controle.current?.abort();
  }, []);

  async function carregarPresets(cursor?: string) {
    setPresets((atual) => ({ ...atual, carregando: true, erro: null }));
    try {
      const url = cursor
        ? `/api/admin/marketing/presets?cursor=${encodeURIComponent(cursor)}`
        : "/api/admin/marketing/presets";
      const resposta = await fetch(url, { cache: "no-store" });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setPresets((atual) => ({
          ...atual,
          carregando: false,
          erro: mensagemDeErro(corpo, "Não foi possível carregar os presets."),
        }));
        return;
      }
      const pagina = corpo as PaginaPresets;
      setPresets((atual) => {
        const vistos = new Set(atual.itens.map((p) => p.id));
        const itens = cursor
          ? [...atual.itens, ...pagina.itens.filter((p) => !vistos.has(p.id))]
          : pagina.itens;
        return { itens, cursor: pagina.cursor, carregando: false, carregado: true, erro: null };
      });
    } catch {
      setPresets((atual) => ({
        ...atual,
        carregando: false,
        erro: "Falha de conexão ao carregar os presets.",
      }));
    }
  }

  function escolherModo(novo: Modo) {
    setModo(novo);
    setErro(null);
    // O catálogo é buscado quando o operador escolhe o modo, não ao abrir a
    // página: quem só gera do zero não precisa de uma chamada ao provedor.
    if (novo === "preset" && !presets.carregado && !presets.carregando) {
      void carregarPresets();
    }
  }

  function usarComoReferencia(url: string) {
    setModo("editar");
    setErro(null);
    setReferencias((atual) =>
      linhas(atual).includes(url) ? atual : [...linhas(atual), url].join("\n"),
    );
  }

  function imagensDoModo(): string[] {
    if (modo === "editar") return linhas(referencias);
    if (modo === "preset") return [produto, modelo].map((url) => url.trim()).filter(Boolean);
    return [];
  }

  async function acompanhar(requestId: string, sinal: AbortSignal) {
    const prazo = Date.now() + PRAZO_MS;
    let falhasSeguidas = 0;

    while (!sinal.aborted) {
      if (Date.now() > prazo) {
        setErro(
          "A geração passou de 5 minutos. Ela continua no provedor — use “Atualizar status” no histórico mais tarde.",
        );
        return;
      }
      await esperar(INTERVALO_MS, sinal);
      if (sinal.aborted) return;

      let resposta: Response;
      try {
        resposta = await fetch(`/api/admin/marketing/imagens/${encodeURIComponent(requestId)}`, {
          cache: "no-store",
          signal: sinal,
        });
      } catch {
        if (sinal.aborted) return;
        // Oscilação de rede não encerra o acompanhamento; três seguidas, sim.
        falhasSeguidas += 1;
        if (falhasSeguidas >= 3) {
          setErro(
            "Perdemos a conexão. A geração continua no provedor — use “Atualizar status” no histórico.",
          );
          return;
        }
        continue;
      }

      falhasSeguidas = 0;
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(mensagemDeErro(corpo, "Não foi possível acompanhar a geração."));
        return;
      }
      const atual = corpo as GeracaoImagem;
      setGeracao(atual);
      if (geracaoTerminou(atual.status)) {
        router.refresh();
        return;
      }
    }
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    const imagens = imagensDoModo();
    if (modo === "editar" && imagens.length === 0) {
      setErro("Informe ao menos um link de imagem para editar.");
      return;
    }
    if (modo === "editar" && imagens.length > LIMITE_REFERENCIAS) {
      setErro(`No máximo ${LIMITE_REFERENCIAS} imagens de referência.`);
      return;
    }
    if (modo === "preset" && !presetId) {
      setErro("Escolha um preset do Marketing Studio.");
      return;
    }
    if (modo === "preset" && !produto.trim()) {
      setErro("Informe o link da imagem do produto.");
      return;
    }

    acompanhamento.current?.abort();
    const controle = new AbortController();
    acompanhamento.current = controle;
    setOcupado(true);
    setGeracao(null);

    try {
      const resposta = await fetch("/api/admin/marketing/imagens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          qualidade,
          resolucao,
          proporcao,
          imagens,
          aprimorar: modo === "preset",
          presetId: modo === "preset" ? presetId : undefined,
        }),
        signal: controle.signal,
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(mensagemDeErro(corpo, "Não foi possível pedir a imagem."));
        return;
      }
      const inicial = corpo as GeracaoImagem;
      setGeracao(inicial);
      // O pedido já entra no histórico, mesmo antes de a imagem ficar pronta.
      router.refresh();
      if (!geracaoTerminou(inicial.status)) await acompanhar(inicial.requestId, controle.signal);
    } catch {
      if (!controle.signal.aborted) setErro("Falha de conexão. Tente novamente.");
    } finally {
      if (acompanhamento.current === controle) {
        acompanhamento.current = null;
        setOcupado(false);
      }
    }
  }

  const emAndamento = geracao !== null && !geracaoTerminou(geracao.status);
  const imagensProntas = geracao?.imagens.filter(linkDeImagemExibivel) ?? [];

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <form
        onSubmit={enviar}
        className="surface-card flex min-w-0 flex-col gap-5 rounded-(--radius-card) border border-[var(--surface-border)] p-5 sm:p-6"
      >
        <div role="group" aria-label="Tipo de geração" className="flex flex-wrap gap-2">
          {MODOS.map((item) => (
            <Chip key={item.id} active={modo === item.id} onClick={() => escolherModo(item.id)}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name={item.icone} />
                {item.rotulo}
              </span>
            </Chip>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Field
            label="Prompt"
            htmlFor="prompt"
            required
            hint={
              modo === "editar"
                ? "Diga o que mudar nas imagens de referência."
                : modo === "preset"
                  ? "Direção criativa para o preset — ex.: minimalista, claro e premium."
                  : "Descreva cena, luz, enquadramento e estilo. Evite pedir texto dentro da imagem."
            }
          >
            <Textarea
              id="prompt"
              name="prompt"
              required
              rows={5}
              maxLength={LIMITE_PROMPT}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex.: técnico instalando um split numa sala clara, luz natural, estética premium"
            />
          </Field>
          <p className="text-muted num text-right text-xs">
            {prompt.length} / {LIMITE_PROMPT}
          </p>
        </div>

        {modo === "gerar" && (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-[0.8125rem] font-semibold">Sugestões para o AirFlow</p>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES_PROMPT.map((sugestao) => (
                <Chip
                  key={sugestao.rotulo}
                  onClick={() => {
                    setPrompt(sugestao.prompt);
                    setProporcao(sugestao.proporcao);
                  }}
                >
                  {sugestao.rotulo}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {modo === "editar" && (
          <Field
            label="Links das imagens"
            htmlFor="referencias"
            required
            hint={`Um por linha, até ${LIMITE_REFERENCIAS}. Links públicos https — quem baixa as imagens é o provedor.`}
          >
            <Textarea
              id="referencias"
              rows={3}
              value={referencias}
              onChange={(e) => setReferencias(e.target.value)}
              placeholder="https://…"
              spellCheck={false}
              className="break-all"
            />
          </Field>
        )}

        {modo === "preset" && (
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="mb-2 text-[0.8125rem] font-semibold">Preset</legend>
            {presets.erro && <Alert tone="danger">{presets.erro}</Alert>}
            {presets.carregando && presets.itens.length === 0 && (
              <p className="text-muted text-sm">Carregando presets…</p>
            )}
            {presets.carregado && presets.itens.length === 0 && !presets.erro && (
              <p className="text-muted text-sm">Nenhum preset disponível no momento.</p>
            )}
            {presets.itens.length > 0 && (
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))]">
                {presets.itens.map((preset) => (
                  <SelectableRow key={preset.id} selected={presetId === preset.id}>
                    <input
                      type="radio"
                      name="preset"
                      value={preset.id}
                      checked={presetId === preset.id}
                      onChange={() => setPresetId(preset.id)}
                      className="sr-only"
                    />
                    <RadioDot selected={presetId === preset.id} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{preset.nome}</span>
                      <span className="text-muted block text-xs">{preset.tipo}</span>
                    </span>
                  </SelectableRow>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {presets.cursor && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={presets.carregando}
                  onClick={() => void carregarPresets(presets.cursor ?? undefined)}
                >
                  {presets.carregando ? "Carregando…" : "Carregar mais presets"}
                </Button>
              )}
              {presets.erro && !presets.carregando && (
                <Button type="button" size="sm" variant="ghost" onClick={() => void carregarPresets()}>
                  Tentar de novo
                </Button>
              )}
            </div>

            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
              <Field label="Imagem do produto" htmlFor="produto" required hint="Link público https.">
                <Input
                  id="produto"
                  type="url"
                  inputMode="url"
                  value={produto}
                  onChange={(e) => setProduto(e.target.value)}
                  placeholder="https://…"
                  spellCheck={false}
                />
              </Field>
              <Field
                label="Imagem do modelo"
                htmlFor="modelo"
                hint="Opcional. Sem ela, a composição fica só com o produto."
              >
                <Input
                  id="modelo"
                  type="url"
                  inputMode="url"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="https://…"
                  spellCheck={false}
                />
              </Field>
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
          <Field
            label="Proporção"
            htmlFor="proporcao"
            hint={
              modo === "preset" && proporcao === "auto"
                ? "Automática usa a proporção do preset."
                : undefined
            }
          >
            <Select
              id="proporcao"
              value={proporcao}
              onChange={(e) => setProporcao(e.target.value as ProporcaoImagem)}
            >
              {PROPORCOES_IMAGEM.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_PROPORCAO[valor]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Resolução" htmlFor="resolucao">
            <Select
              id="resolucao"
              value={resolucao}
              onChange={(e) => setResolucao(e.target.value as ResolucaoImagem)}
            >
              {RESOLUCOES_IMAGEM.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_RESOLUCAO[valor]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qualidade" htmlFor="qualidade">
            <Select
              id="qualidade"
              value={qualidade}
              onChange={(e) => setQualidade(e.target.value as QualidadeImagem)}
            >
              {QUALIDADES_IMAGEM.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_QUALIDADE[valor]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p className="text-muted text-xs leading-relaxed">
          {modoProvedor === "real"
            ? "Cada geração consome créditos da conta Higgsfield da plataforma — a cobrança é por tokens, e resolução 4k, qualidade alta e imagens de referência custam mais. Tudo fica registrado na auditoria."
            : "Sandbox: a prévia é simulada e nada é cobrado. O pedido fica registrado na auditoria do mesmo jeito."}
        </p>

        {erro && <Alert tone="danger">{erro}</Alert>}

        <div>
          <Button type="submit" disabled={ocupado}>
            <Icon name="magic-wand" />
            {ocupado
              ? "Gerando…"
              : modo === "editar"
                ? "Editar imagem"
                : modo === "preset"
                  ? "Gerar com preset"
                  : "Gerar imagem"}
          </Button>
        </div>
      </form>

      <section
        aria-labelledby="resultado-titulo"
        className="surface-card flex min-w-0 flex-col gap-4 rounded-(--radius-card) border border-[var(--surface-border)] p-5 sm:p-6 xl:self-start"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="resultado-titulo" className="text-lg font-bold tracking-[-0.02em]">
            Resultado
          </h2>
          <p role="status" className="min-w-0">
            {geracao && (
              <Badge tone={tomDoStatusGeracao(geracao.status)}>
                {emAndamento && <LiveDot />}
                {ROTULO_STATUS[geracao.status]}
              </Badge>
            )}
          </p>
        </div>

        {!geracao && (
          <div className="grid aspect-square place-items-center rounded-[18px] border border-dashed border-[var(--surface-border)] bg-[var(--surface-muted)] p-6 text-center">
            <div>
              <Icon name="image" className="text-4xl text-[var(--text-muted)]" />
              <p className="text-muted mt-2 text-sm">A imagem aparece aqui assim que ficar pronta.</p>
            </div>
          </div>
        )}

        {emAndamento && (
          <>
            <Skeleton className="aspect-square w-full" />
            <p className="text-secondary text-sm">
              Isso leva de alguns segundos a poucos minutos. A tela atualiza sozinha.
            </p>
          </>
        )}

        {geracao?.erro && (
          <Alert tone={geracao.status === "BLOQUEADA" ? "warning" : "danger"}>{geracao.erro}</Alert>
        )}

        {geracao && imagensProntas.length > 0 && (
          <ul className="flex flex-col gap-4">
            {imagensProntas.map((url, indice) => (
              <li key={url} className="flex min-w-0 flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Imagem gerada ${indice + 1} de ${imagensProntas.length}`}
                  className="w-full rounded-[18px] border border-[var(--surface-border)] bg-[var(--surface-muted)] object-contain"
                />
                <div className="flex flex-wrap gap-2">
                  <LinkDaImagem url={url} requestId={geracao.requestId} />
                  {url.startsWith("https://") && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => usarComoReferencia(url)}
                    >
                      <Icon name="pencil-simple" />
                      Editar esta imagem
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Abrir a imagem em tamanho real. A prévia do sandbox é `data:`, que o
 * navegador se recusa a abrir em aba nova — então ela é baixada.
 */
export function LinkDaImagem({ url, requestId }: { url: string; requestId: string }) {
  if (!linkDeImagemExibivel(url)) return null;
  if (url.startsWith("data:")) {
    return (
      <a href={url} download={`airflow-previa-${requestId.slice(0, 8)}.svg`} className={LINK_ACAO}>
        <Icon name="download-simple" />
        Baixar prévia
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={LINK_ACAO}>
      <Icon name="arrow-square-out" />
      Abrir em tamanho real
    </a>
  );
}

/**
 * Consulta de novo uma geração que ficou sem desfecho no histórico — o
 * operador saiu da página, ou o acompanhamento passou do prazo.
 */
export function AtualizarGeracao({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function atualizar() {
    setOcupado(true);
    setAviso(null);
    try {
      const resposta = await fetch(`/api/admin/marketing/imagens/${encodeURIComponent(requestId)}`, {
        cache: "no-store",
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setAviso(mensagemDeErro(corpo, "Não foi possível consultar a geração."));
        return;
      }
      const atual = corpo as GeracaoImagem;
      if (geracaoTerminou(atual.status)) router.refresh();
      else setAviso(`Ainda em andamento no provedor (${ROTULO_STATUS[atual.status].toLowerCase()}).`);
    } catch {
      setAviso("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={ocupado}
        onClick={() => void atualizar()}
      >
        <Icon name="arrows-clockwise" />
        {ocupado ? "Consultando…" : "Atualizar status"}
      </Button>
      {aviso && (
        <p role="status" className="text-muted text-xs">
          {aviso}
        </p>
      )}
    </div>
  );
}
