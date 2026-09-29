"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import {
  LIMITE_REFERENCIA_BYTES,
  MODELO_DA_SUPERFICIE,
  MODELOS,
  ROTULO_MODERACAO,
  ROTULOS_OPCAO,
  SEEDANCE_25,
  SUNBURST,
  TIPOS_REFERENCIA,
  ehTipoReferencia,
  type SuperficieEstudio,
} from "@/domain/estudio/catalogo";
import type { GeracaoDTO } from "@/server/services/estudio-service";
import { Alert, Badge, Button, Card, Chip, Field, Icon, IconBox, Textarea } from "@/ui";
import { DialogoChaveApi, type ModoDialogoChave } from "@/ui/estudio-chave-dialog";
import { ListaGeracoes } from "@/ui/estudio-geracoes";

/**
 * Estúdio de marketing — gera imagens (Marketing Studio Image · Sunburst) e
 * vídeos (Seedance 2.5) na Higgsfield com a chave do admin.
 *
 * O navegador nunca fala com a API da Higgsfield: submit, poll, cancelamento,
 * presets e o pedido de upload passam por /api/admin/estudio/*. A única
 * requisição direta é o PUT da referência na URL assinada de storage — sem
 * credenciais e só com os headers que o servidor devolveu.
 */

interface AjustesImagem {
  quality: (typeof SUNBURST.qualidades)[number];
  resolution: (typeof SUNBURST.resolucoes)[number];
  aspect_ratio: (typeof SUNBURST.proporcoes)[number];
  moderation: (typeof SUNBURST.moderacoes)[number];
}

interface AjustesVideo {
  duration: number;
  resolution: (typeof SEEDANCE_25.resolucoes)[number];
  aspect_ratio: (typeof SEEDANCE_25.proporcoes)[number];
  generate_audio: boolean;
  bitrate_mode: (typeof SEEDANCE_25.bitrates)[number];
}

interface Referencia {
  id: string;
  nome: string;
  /** Object URL local: a prévia não depende do storage. */
  previa: string;
  /** `public_url` — só existe depois que o PUT deu certo. */
  url: string | null;
  estado: "enviando" | "pronta" | "erro";
  erro?: string;
}

interface Preset {
  id: string;
  nome: string;
  tipo: string | null;
}

interface ErroApi {
  error?: { code?: string; message?: string; details?: Array<{ path?: unknown[]; message?: string }> };
}

const INTERVALO_INICIAL_MS = 4_000;
const INTERVALO_MAXIMO_MS = 20_000;
/** Depois disso o poll automático para e o cartão oferece "Verificar agora". */
const PRAZO_MS: Record<SuperficieEstudio, number> = { IMAGEM: 15 * 60_000, VIDEO: 30 * 60_000 };

const SELECT =
  "surface-card h-11 w-full rounded-(--radius-field) border border-[var(--surface-border)] px-3 text-sm outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-60";

const PLACEHOLDER: Record<SuperficieEstudio, string> = {
  IMAGEM:
    "Técnico de ar-condicionado uniformizado sorrindo ao lado de um split recém-instalado, sala clara, luz natural, estilo campanha publicitária",
  VIDEO:
    "Close cinematográfico de um técnico limpando o filtro de um ar-condicionado split, luz suave de fim de tarde, câmera lenta",
};

function mensagemDe(dados: unknown, padrao: string): { codigo: string | null; mensagem: string } {
  const erro = (dados as ErroApi | null)?.error;
  if (!erro) return { codigo: null, mensagem: padrao };
  if (erro.code === "VALIDATION_ERROR" && Array.isArray(erro.details) && erro.details.length) {
    const campos = erro.details
      .slice(0, 3)
      .map((d) => (d.path?.length ? `${d.path.join(".")}: ${d.message}` : d.message))
      .join("; ");
    return { codigo: erro.code, mensagem: `Dados inválidos — ${campos}` };
  }
  return { codigo: erro.code ?? null, mensagem: erro.message ?? padrao };
}

/** Cópia do registro sem a chave `id`. */
function omitir<T>(registro: Readonly<Record<string, T>>, id: string): Record<string, T> {
  const copia = { ...registro };
  delete copia[id];
  return copia;
}

function rotuloOpcao(valor: string): string {
  return ROTULOS_OPCAO[valor] ?? valor;
}

export function EstudioMarketing({
  chaveSalva: chaveInicial,
  geracoesIniciais,
}: {
  chaveSalva: boolean;
  geracoesIniciais: GeracaoDTO[];
}) {
  const [chaveSalva, setChaveSalva] = useState(chaveInicial);
  const [dialogo, setDialogo] = useState<ModoDialogoChave | null>(null);
  const [avisoDialogo, setAvisoDialogo] = useState<string | null>(null);

  const [superficie, setSuperficie] = useState<SuperficieEstudio>("IMAGEM");
  const [prompts, setPrompts] = useState<Record<SuperficieEstudio, string>>({ IMAGEM: "", VIDEO: "" });
  const [imagem, setImagem] = useState<AjustesImagem>({
    quality: "high",
    resolution: "2k",
    aspect_ratio: "auto",
    moderation: "auto",
  });
  const [video, setVideo] = useState<AjustesVideo>({
    duration: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
    bitrate_mode: "high",
  });

  const [modoImagem, setModoImagem] = useState<"direto" | "preset">("direto");
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [erroReferencia, setErroReferencia] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [cursorPresets, setCursorPresets] = useState<string | null>(null);
  const [presetsCarregados, setPresetsCarregados] = useState(false);
  const [carregandoPresets, setCarregandoPresets] = useState(false);
  const [erroPresets, setErroPresets] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);

  const [geracoes, setGeracoes] = useState<GeracaoDTO[]>(geracoesIniciais);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [pausadas, setPausadas] = useState<Record<string, string>>({});
  const [cancelando, setCancelando] = useState<Record<string, boolean>>({});
  const [errosCartao, setErrosCartao] = useState<Record<string, string>>({});
  /** Sobe a cada poll concluído: faz o efeito agendar o próximo mesmo sem mudança. */
  const [versaoPoll, setVersaoPoll] = useState(0);

  /** Intenção de gerar ainda sem resposta definitiva — o retry reaproveita a chave. */
  const pendente = useRef<{ chave: string; corpo: string } | null>(null);
  const agendados = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const rodadas = useRef(new Map<string, number>());
  const esperaMinima = useRef(new Map<string, number>());
  const previas = useRef(new Set<string>());

  const modelo = MODELOS[MODELO_DA_SUPERFICIE[superficie]];
  const prompt = prompts[superficie];
  const maxPrompt = superficie === "IMAGEM" ? SUNBURST.maxPrompt : SEEDANCE_25.maxPrompt;
  const maxReferencias = modoImagem === "preset" ? SUNBURST.maxReferenciasPreset : SUNBURST.maxReferencias;
  const referenciasProntas = referencias.filter((r) => r.estado === "pronta" && r.url);

  // ── Chave ───────────────────────────────────────────────────────────────
  function abrirDialogo(modo: ModoDialogoChave, aviso: string | null = null) {
    setAvisoDialogo(aviso);
    setDialogo(modo);
  }

  function aoSalvarChave() {
    setChaveSalva(true);
    setDialogo(null);
    setAvisoDialogo(null);
    // Com chave nova, o que parou por falta de chave volta a ser acompanhado.
    rodadas.current.clear();
    esperaMinima.current.clear();
    setPausadas({});
  }

  function aoRemoverChave() {
    setChaveSalva(false);
    setDialogo(null);
    setAvisoDialogo(null);
    setPresets([]);
    setPresetsCarregados(false);
  }

  /** Reações comuns aos códigos de erro das rotas do Estúdio. */
  function reagirAoErro(codigo: string | null, mensagem: string) {
    if (codigo === "HIGGSFIELD_CHAVE_AUSENTE") {
      setChaveSalva(false);
      abrirDialogo("conectar");
    } else if (codigo === "HIGGSFIELD_CHAVE_RECUSADA") {
      abrirDialogo("substituir", mensagem);
    }
  }

  // ── Poll ────────────────────────────────────────────────────────────────
  const consultar = useCallback(
    async (id: string, criadaEm: string, sup: SuperficieEstudio, manual = false) => {
      if (!manual && Date.now() > new Date(criadaEm).getTime() + PRAZO_MS[sup]) {
        setPausadas((atual) => ({
          ...atual,
          [id]: "O acompanhamento automático parou. A geração pode seguir na Higgsfield — verifique de novo.",
        }));
        return;
      }
      rodadas.current.set(id, (rodadas.current.get(id) ?? 0) + 1);
      try {
        const resposta = await fetch(`/api/admin/estudio/geracoes/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        const dados: unknown = await resposta.json().catch(() => null);
        if (resposta.ok) {
          const corpo = dados as { geracao: GeracaoDTO; chaveAusente?: boolean };
          esperaMinima.current.delete(id);
          setGeracoes((lista) => lista.map((g) => (g.id === corpo.geracao.id ? corpo.geracao : g)));
          setErrosCartao((atual) => omitir(atual, id));
          if (corpo.chaveAusente) {
            setChaveSalva(false);
            setPausadas((atual) => ({
              ...atual,
              [id]: "Conecte a chave de API para continuar acompanhando esta geração.",
            }));
          }
          return;
        }
        const { codigo, mensagem } = mensagemDe(dados, `Falha ao consultar (${resposta.status}).`);
        if (resposta.status === 429) {
          const segundos = Number(resposta.headers.get("retry-after"));
          esperaMinima.current.set(
            id,
            Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : INTERVALO_MAXIMO_MS,
          );
        } else if (resposta.status === 404 || resposta.status === 401 || codigo === "HIGGSFIELD_CHAVE_RECUSADA") {
          setPausadas((atual) => ({ ...atual, [id]: mensagem }));
          if (codigo === "HIGGSFIELD_CHAVE_RECUSADA") {
            setAvisoDialogo(mensagem);
            setDialogo("substituir");
          }
        } else {
          // 5xx, Higgsfield fora: mostra e tenta de novo com backoff.
          setErrosCartao((atual) => ({ ...atual, [id]: mensagem }));
        }
      } catch {
        setErrosCartao((atual) => ({ ...atual, [id]: "Sem conexão com o servidor — tentando de novo." }));
      } finally {
        setVersaoPoll((v) => v + 1);
      }
    },
    [],
  );

  // Agenda um poll por geração em andamento, cada uma no próprio ritmo. Não
  // limpa os timers a cada execução: se limpasse, o poll rápido de uma geração
  // reiniciaria para sempre o timer lento de outra.
  useEffect(() => {
    const mapa = agendados.current;
    for (const g of geracoes) {
      const ativo = mapa.get(g.id);
      if (g.terminal || pausadas[g.id]) {
        if (ativo) {
          clearTimeout(ativo);
          mapa.delete(g.id);
        }
        continue;
      }
      if (ativo) continue;
      const rodada = rodadas.current.get(g.id) ?? 0;
      const atraso = Math.max(
        esperaMinima.current.get(g.id) ?? 0,
        Math.min(INTERVALO_INICIAL_MS * 1.5 ** rodada, INTERVALO_MAXIMO_MS),
      );
      mapa.set(
        g.id,
        setTimeout(() => {
          mapa.delete(g.id);
          void consultar(g.id, g.criadaEm, g.superficie);
        }, atraso),
      );
    }
  }, [geracoes, pausadas, versaoPoll, consultar]);

  useEffect(() => {
    const mapa = agendados.current;
    const urls = previas.current;
    return () => {
      for (const timer of mapa.values()) clearTimeout(timer);
      mapa.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function verificarAgora(id: string) {
    const geracao = geracoes.find((g) => g.id === id);
    if (geracao) void consultar(geracao.id, geracao.criadaEm, geracao.superficie, true);
  }

  async function cancelar(id: string) {
    setCancelando((atual) => ({ ...atual, [id]: true }));
    setErrosCartao((atual) => omitir(atual, id));
    try {
      const resposta = await fetch(`/api/admin/estudio/geracoes/${encodeURIComponent(id)}/cancelar`, {
        method: "POST",
      });
      const dados: unknown = await resposta.json().catch(() => null);
      if (resposta.ok) {
        const { geracao } = dados as { geracao: GeracaoDTO };
        setGeracoes((lista) => lista.map((g) => (g.id === geracao.id ? geracao : g)));
        return;
      }
      const { codigo, mensagem } = mensagemDe(dados, "Não foi possível cancelar.");
      setErrosCartao((atual) => ({ ...atual, [id]: mensagem }));
      reagirAoErro(codigo, mensagem);
    } catch {
      setErrosCartao((atual) => ({ ...atual, [id]: "Falha de conexão ao cancelar. Tente de novo." }));
    } finally {
      setCancelando((atual) => omitir(atual, id));
    }
  }

  // ── Referências (upload assinado) ───────────────────────────────────────
  async function adicionarArquivos(evento: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? []);
    evento.target.value = "";
    setErroReferencia(null);
    let vagas = maxReferencias - referencias.filter((r) => r.estado !== "erro").length;

    for (const arquivo of arquivos) {
      if (vagas <= 0) {
        setErroReferencia(`Limite de ${maxReferencias} imagens neste modo.`);
        break;
      }
      if (!ehTipoReferencia(arquivo.type)) {
        setErroReferencia(`“${arquivo.name}” não é PNG, JPEG ou WebP.`);
        continue;
      }
      if (arquivo.size > LIMITE_REFERENCIA_BYTES) {
        setErroReferencia(`“${arquivo.name}” passa de ${LIMITE_REFERENCIA_BYTES / 1024 / 1024} MB.`);
        continue;
      }
      vagas -= 1;

      const id = crypto.randomUUID();
      const previa = URL.createObjectURL(arquivo);
      previas.current.add(previa);
      setReferencias((atual) => [...atual, { id, nome: arquivo.name, previa, url: null, estado: "enviando" }]);

      try {
        const resposta = await fetch("/api/admin/estudio/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contentType: arquivo.type }),
        });
        const dados: unknown = await resposta.json().catch(() => null);
        if (!resposta.ok) {
          const { codigo, mensagem } = mensagemDe(dados, `Não foi possível preparar o upload (${resposta.status}).`);
          reagirAoErro(codigo, mensagem);
          throw new Error(mensagem);
        }
        const { ticket } = dados as {
          ticket: { uploadUrl: string; uploadHeaders: Record<string, string>; publicUrl: string };
        };
        // Direto no storage, sem cookie e sem a chave: só os headers assinados.
        const envio = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: ticket.uploadHeaders,
          body: arquivo,
          credentials: "omit",
        });
        if (!envio.ok) throw new Error(`O storage recusou o arquivo (${envio.status}). Envie de novo.`);
        // A URL pública só vale depois do PUT confirmado.
        setReferencias((atual) =>
          atual.map((r) => (r.id === id ? { ...r, url: ticket.publicUrl, estado: "pronta" } : r)),
        );
      } catch (erro) {
        const mensagem =
          erro instanceof TypeError
            ? "O navegador não conseguiu enviar ao storage (rede ou CORS). Tente de novo."
            : erro instanceof Error
              ? erro.message
              : "Falha no upload.";
        setReferencias((atual) =>
          atual.map((r) => (r.id === id ? { ...r, estado: "erro", erro: mensagem } : r)),
        );
      }
    }
  }

  function removerReferencia(id: string) {
    setReferencias((atual) => {
      const alvo = atual.find((r) => r.id === id);
      if (alvo) {
        URL.revokeObjectURL(alvo.previa);
        previas.current.delete(alvo.previa);
      }
      return atual.filter((r) => r.id !== id);
    });
  }

  // ── Presets (enhance_prompt) ────────────────────────────────────────────
  async function carregarPresets(cursor: string | null) {
    setCarregandoPresets(true);
    setErroPresets(null);
    try {
      const resposta = await fetch(
        `/api/admin/estudio/presets${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store" },
      );
      const dados: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        const { codigo, mensagem } = mensagemDe(dados, "Não foi possível carregar os presets.");
        setErroPresets(mensagem);
        reagirAoErro(codigo, mensagem);
        return;
      }
      const pagina = dados as { itens: Preset[]; cursor: string | null };
      setPresets((atual) => (cursor ? [...atual, ...pagina.itens] : pagina.itens));
      setCursorPresets(pagina.cursor);
      setPresetsCarregados(true);
    } catch {
      setErroPresets("Falha de conexão ao carregar os presets.");
    } finally {
      setCarregandoPresets(false);
    }
  }

  function escolherModoImagem(modo: "direto" | "preset") {
    setModoImagem(modo);
    if (modo === "preset" && !presetsCarregados && !carregandoPresets && chaveSalva) {
      void carregarPresets(null);
    }
  }

  // ── Envio ───────────────────────────────────────────────────────────────
  const bloqueio: string | null = !chaveSalva
    ? "Conecte a chave de API (Connect API key) para gerar."
    : !prompt.trim()
      ? "Descreva o que gerar."
      : superficie === "IMAGEM" && referencias.some((r) => r.estado === "enviando")
        ? "Aguarde o envio das imagens de referência."
        : superficie === "IMAGEM" && modoImagem === "preset" && !presetId
          ? "Escolha um preset do Marketing Studio."
          : superficie === "IMAGEM" && modoImagem === "preset" && referenciasProntas.length < 1
            ? "Com preset, envie a imagem do produto."
            : superficie === "IMAGEM" && referenciasProntas.length > maxReferencias
              ? `Use no máximo ${maxReferencias} imagens neste modo.`
              : null;

  function montarEntrada(): { modelo: string; entrada: Record<string, unknown> } {
    const texto = prompt.trim();
    if (superficie === "VIDEO") {
      return { modelo: MODELO_DA_SUPERFICIE.VIDEO, entrada: { prompt: texto, ...video } };
    }
    const urls = referenciasProntas.map((r) => r.url as string);
    return {
      modelo: MODELO_DA_SUPERFICIE.IMAGEM,
      entrada: {
        prompt: texto,
        ...imagem,
        enhance_prompt: modoImagem === "preset",
        ...(modoImagem === "preset" && presetId ? { preset_id: presetId } : {}),
        ...(urls.length ? { image_urls: urls } : {}),
      },
    };
  }

  async function gerar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando || bloqueio) return;
    const { modelo: caminho, entrada } = montarEntrada();
    const corpo = JSON.stringify({ modelo: caminho, entrada });
    // A mesma intenção repetida depois de uma queda reaproveita a chave de
    // idempotência: o servidor devolve a geração que já existe em vez de
    // cobrar outra. Intenção nova (qualquer campo diferente) ganha chave nova.
    const chave = pendente.current?.corpo === corpo ? pendente.current.chave : crypto.randomUUID();
    pendente.current = { chave, corpo };

    setEnviando(true);
    setErroEnvio(null);
    try {
      const resposta = await fetch("/api/admin/estudio/geracoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: chave, modelo: caminho, entrada }),
      });
      const dados: unknown = await resposta.json().catch(() => null);
      // 2xx e 4xx são respostas definitivas; 5xx pode ter deixado o envio no
      // meio do caminho — a chave fica guardada para o retry.
      if (resposta.status < 500) pendente.current = null;
      if (!resposta.ok) {
        const { codigo, mensagem } = mensagemDe(dados, `Não foi possível gerar (${resposta.status}).`);
        setErroEnvio(
          resposta.status >= 500
            ? `${mensagem} Clique em gerar de novo: o mesmo pedido é reaproveitado, sem cobrar duas vezes.`
            : mensagem,
        );
        reagirAoErro(codigo, mensagem);
        return;
      }
      const { geracao, tipoFalha } = dados as { geracao: GeracaoDTO; tipoFalha: string | null };
      setGeracoes((lista) => [geracao, ...lista.filter((g) => g.id !== geracao.id)]);
      if (tipoFalha === "CHAVE_RECUSADA") abrirDialogo("substituir", geracao.erro);
    } catch {
      setErroEnvio(
        "Sem resposta do servidor. Clique em gerar de novo: o mesmo pedido é reaproveitado, sem cobrar duas vezes.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconBox name="key" tone={chaveSalva ? "soft" : "subtle"} size={44} />
          <div className="min-w-0">
            <p className="font-semibold">Higgsfield</p>
            <p className="text-secondary text-sm leading-snug">
              {chaveSalva
                ? "Chave conectada. Ela fica cifrada no servidor e nunca volta ao navegador."
                : "Conecte a chave de API da sua conta. Cada geração é cobrada nessa conta."}
            </p>
          </div>
        </div>
        {chaveSalva ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">
              <Icon name="check-circle" />
              API key saved
            </Badge>
            <Button variant="secondary" size="sm" onClick={() => abrirDialogo("gerenciar")}>
              Manage API key
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => abrirDialogo("conectar")}>
            <Icon name="key" />
            Connect API key
          </Button>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:items-start">
        <Card className="p-5">
          <form onSubmit={gerar} className="flex flex-col gap-5" noValidate>
            <div role="group" aria-label="Tipo de mídia" className="flex flex-wrap gap-2">
              <Chip active={superficie === "IMAGEM"} onClick={() => setSuperficie("IMAGEM")}>
                <Icon name="image" className="mr-1.5" />
                Imagem
              </Chip>
              <Chip active={superficie === "VIDEO"} onClick={() => setSuperficie("VIDEO")}>
                <Icon name="film-strip" className="mr-1.5" />
                Vídeo
              </Chip>
            </div>

            <div className="surface-muted rounded-[14px] px-4 py-3">
              <p className="text-sm font-semibold">{modelo.rotulo}</p>
              <p className="text-muted text-xs">{modelo.detalhe}</p>
            </div>

            <Field
              label="Prompt"
              htmlFor="estudio-prompt"
              required
              hint={`${prompt.length}/${maxPrompt} caracteres`}
            >
              <Textarea
                id="estudio-prompt"
                value={prompt}
                maxLength={maxPrompt}
                placeholder={PLACEHOLDER[superficie]}
                onChange={(e) => setPrompts((atual) => ({ ...atual, [superficie]: e.target.value }))}
              />
            </Field>

            {superficie === "IMAGEM" ? (
              <>
                <div role="group" aria-label="Modo de geração" className="flex flex-wrap gap-2">
                  <Chip active={modoImagem === "direto"} onClick={() => escolherModoImagem("direto")}>
                    Geração direta
                  </Chip>
                  <Chip active={modoImagem === "preset"} onClick={() => escolherModoImagem("preset")}>
                    Preset do Marketing Studio
                  </Chip>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Qualidade" htmlFor="img-quality">
                    <select
                      id="img-quality"
                      className={SELECT}
                      value={imagem.quality}
                      onChange={(e) =>
                        setImagem((a) => ({ ...a, quality: e.target.value as AjustesImagem["quality"] }))
                      }
                    >
                      {SUNBURST.qualidades.map((v) => (
                        <option key={v} value={v}>
                          {rotuloOpcao(v)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Resolução" htmlFor="img-resolution">
                    <select
                      id="img-resolution"
                      className={SELECT}
                      value={imagem.resolution}
                      onChange={(e) =>
                        setImagem((a) => ({ ...a, resolution: e.target.value as AjustesImagem["resolution"] }))
                      }
                    >
                      {SUNBURST.resolucoes.map((v) => (
                        <option key={v} value={v}>
                          {v.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Proporção"
                    htmlFor="img-aspect"
                    hint={modoImagem === "preset" ? "Automática usa a proporção do preset." : undefined}
                  >
                    <select
                      id="img-aspect"
                      className={SELECT}
                      value={imagem.aspect_ratio}
                      onChange={(e) =>
                        setImagem((a) => ({ ...a, aspect_ratio: e.target.value as AjustesImagem["aspect_ratio"] }))
                      }
                    >
                      {SUNBURST.proporcoes.map((v) => (
                        <option key={v} value={v}>
                          {rotuloOpcao(v)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Moderação" htmlFor="img-moderation">
                    <select
                      id="img-moderation"
                      className={SELECT}
                      value={imagem.moderation}
                      onChange={(e) =>
                        setImagem((a) => ({ ...a, moderation: e.target.value as AjustesImagem["moderation"] }))
                      }
                    >
                      {SUNBURST.moderacoes.map((v) => (
                        <option key={v} value={v}>
                          {ROTULO_MODERACAO[v]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {modoImagem === "preset" && (
                  <fieldset className="flex min-w-0 flex-col gap-2">
                    <legend className="mb-1.5 text-[0.8125rem] font-semibold">Preset</legend>
                    {!chaveSalva && (
                      <p className="text-muted text-xs">Conecte a chave para listar os presets da sua conta.</p>
                    )}
                    {erroPresets && <Alert tone="danger">{erroPresets}</Alert>}
                    {presetsCarregados && presets.length === 0 && (
                      <p className="text-muted text-xs">Nenhum preset visível para esta conta.</p>
                    )}
                    {presets.length > 0 && (
                      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
                        {presets.map((preset) => (
                          <li key={preset.id}>
                            <label
                              className={`flex cursor-pointer items-center gap-2.5 rounded-[12px] border px-3 py-2 text-sm transition-colors ${
                                presetId === preset.id
                                  ? "accent-soft border-[var(--accent)]"
                                  : "border-[var(--surface-border)] hover:border-[var(--accent-border)]"
                              }`}
                            >
                              <input
                                type="radio"
                                name="preset"
                                value={preset.id}
                                checked={presetId === preset.id}
                                onChange={() => setPresetId(preset.id)}
                                className="accent-[var(--accent)]"
                              />
                              <span className="min-w-0 flex-1 truncate">{preset.nome}</span>
                              {preset.tipo && <span className="text-muted text-xs">{preset.tipo}</span>}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {chaveSalva && (!presetsCarregados || cursorPresets) && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void carregarPresets(presetsCarregados ? cursorPresets : null)}
                          disabled={carregandoPresets}
                        >
                          {carregandoPresets
                            ? "Carregando…"
                            : presetsCarregados
                              ? "Carregar mais presets"
                              : "Carregar presets"}
                        </Button>
                      )}
                    </div>
                  </fieldset>
                )}

                <Field
                  label={
                    modoImagem === "preset"
                      ? "Imagens: produto (obrigatória) e modelo (opcional)"
                      : "Imagens de referência (opcional)"
                  }
                  htmlFor="estudio-referencias"
                  hint={`PNG, JPEG ou WebP, até ${LIMITE_REFERENCIA_BYTES / 1024 / 1024} MB cada. ${
                    modoImagem === "preset"
                      ? "A primeira é o produto; a segunda, a referência de modelo."
                      : `Com imagens, o Sunburst edita a partir delas (até ${SUNBURST.maxReferencias}).`
                  }`}
                >
                  <input
                    id="estudio-referencias"
                    type="file"
                    accept={TIPOS_REFERENCIA.join(",")}
                    multiple
                    disabled={!chaveSalva}
                    onChange={adicionarArquivos}
                    className="text-secondary w-full text-sm file:mr-3 file:rounded-(--radius-pill) file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-[0.8125rem] file:font-semibold file:text-[var(--accent-text)] disabled:opacity-60"
                  />
                </Field>
                {erroReferencia && <Alert tone="warning">{erroReferencia}</Alert>}
                {referencias.length > 0 && (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {referencias.map((referencia, indice) => (
                      <li key={referencia.id} className="flex min-w-0 flex-col gap-1">
                        <div className="relative">
                          {/* Prévia local (object URL) — não depende do storage. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={referencia.previa}
                            alt={`Referência ${indice + 1}: ${referencia.nome}`}
                            className={`aspect-square w-full rounded-[12px] border object-cover ${
                              referencia.estado === "erro"
                                ? "border-danger-500 opacity-60"
                                : "border-[var(--surface-border)]"
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => removerReferencia(referencia.id)}
                            aria-label={`Remover ${referencia.nome}`}
                            className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-xs shadow-sm"
                          >
                            <Icon name="x" />
                          </button>
                        </div>
                        <span className="text-muted truncate text-[0.6875rem]">
                          {referencia.estado === "enviando"
                            ? "Enviando…"
                            : referencia.estado === "erro"
                              ? (referencia.erro ?? "Falhou")
                              : modoImagem === "preset"
                                ? indice === 0
                                  ? "Produto"
                                  : "Modelo"
                                : "Pronta"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={`Duração: ${video.duration} s`}
                  htmlFor="vid-duration"
                  hint={`${SEEDANCE_25.duracaoMin} a ${SEEDANCE_25.duracaoMax} segundos`}
                >
                  <input
                    id="vid-duration"
                    type="range"
                    min={SEEDANCE_25.duracaoMin}
                    max={SEEDANCE_25.duracaoMax}
                    step={1}
                    value={video.duration}
                    onChange={(e) => setVideo((a) => ({ ...a, duration: Number(e.target.value) }))}
                    className="h-11 w-full accent-[var(--accent)]"
                  />
                </Field>
                <Field label="Resolução" htmlFor="vid-resolution">
                  <select
                    id="vid-resolution"
                    className={SELECT}
                    value={video.resolution}
                    onChange={(e) =>
                      setVideo((a) => ({ ...a, resolution: e.target.value as AjustesVideo["resolution"] }))
                    }
                  >
                    {SEEDANCE_25.resolucoes.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Proporção" htmlFor="vid-aspect">
                  <select
                    id="vid-aspect"
                    className={SELECT}
                    value={video.aspect_ratio}
                    onChange={(e) =>
                      setVideo((a) => ({ ...a, aspect_ratio: e.target.value as AjustesVideo["aspect_ratio"] }))
                    }
                  >
                    {SEEDANCE_25.proporcoes.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Bitrate" htmlFor="vid-bitrate">
                  <select
                    id="vid-bitrate"
                    className={SELECT}
                    value={video.bitrate_mode}
                    onChange={(e) =>
                      setVideo((a) => ({ ...a, bitrate_mode: e.target.value as AjustesVideo["bitrate_mode"] }))
                    }
                  >
                    {SEEDANCE_25.bitrates.map((v) => (
                      <option key={v} value={v}>
                        {v === "high" ? "Alto" : "Padrão"}
                      </option>
                    ))}
                  </select>
                </Field>
                <label htmlFor="vid-audio" className="flex items-center gap-2.5 text-sm font-semibold sm:col-span-2">
                  <input
                    id="vid-audio"
                    type="checkbox"
                    checked={video.generate_audio}
                    onChange={(e) => setVideo((a) => ({ ...a, generate_audio: e.target.checked }))}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Gerar áudio junto com o vídeo
                </label>
              </div>
            )}

            {erroEnvio && <Alert tone="danger">{erroEnvio}</Alert>}

            <div className="flex flex-col gap-2">
              <Button type="submit" fullWidth disabled={enviando || Boolean(bloqueio)}>
                <Icon name="sparkle" />
                {enviando ? "Enviando…" : superficie === "IMAGEM" ? "Gerar imagem" : "Gerar vídeo"}
              </Button>
              <p className="text-muted text-xs leading-snug">
                {bloqueio ??
                  "Cada geração é cobrada na conta Higgsfield dona da chave. O botão trava enquanto o pedido está em voo."}
              </p>
            </div>
          </form>
        </Card>

        <section aria-labelledby="titulo-geracoes" className="min-w-0">
          <h2 id="titulo-geracoes" className="mb-3 text-base font-bold tracking-[-0.02em]">
            Gerações
          </h2>
          <ListaGeracoes
            geracoes={geracoes}
            pausadas={pausadas}
            cancelando={cancelando}
            errosCartao={errosCartao}
            onCancelar={cancelar}
            onVerificar={verificarAgora}
          />
        </section>
      </div>

      <DialogoChaveApi
        modo={dialogo}
        aviso={avisoDialogo}
        onModo={setDialogo}
        onFechar={() => {
          setDialogo(null);
          setAvisoDialogo(null);
        }}
        onSalva={aoSalvarChave}
        onRemovida={aoRemoverChave}
      />
    </div>
  );
}
