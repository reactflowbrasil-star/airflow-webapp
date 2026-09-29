/**
 * Estúdio de marketing — contrato com o Higgsfield, sem rede e sem banco.
 *
 * O que estes testes protegem: o pedido pago só sai do servidor válido e no
 * formato exato do provedor; a credencial nunca aparece em mensagem nem em
 * log; e nada vindo de fora vira link executável no painel.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  geracaoTerminou,
  linkDeImagemExibivel,
  STATUS_GERACAO,
} from "@/lib/marketing-image";
import { pedidoImagemMarketingSchema, requestIdSchema } from "@/lib/validation/marketing";
import {
  descreverDetalheHiggsfield,
  HiggsfieldImagemProvider,
  lerCredencialHiggsfield,
  montarCorpoHiggsfield,
  traduzirPresetsHiggsfield,
  traduzirRespostaHiggsfield,
} from "@/server/marketing/higgsfield-provider";
import { ImagemMarketingError } from "@/server/marketing/image-provider";
import { SandboxImagemProvider } from "@/server/marketing/sandbox-provider";

const REQUEST_ID = "3f9c2a1e-8b4d-4c6e-9a2f-1d7e5b3c9a01";
const PRESET_ID = "7e68c81e-5f97-4f48-bcab-f0d4dd75a99d";
const SEGREDO = "segredo-que-nao-pode-vazar";
const AUTORIZACAO = `Key id-da-chave:${SEGREDO}`;
const CID = "test-estudio";

/** Chaves que o JSON Schema do modelo aceita (`additionalProperties: false`). */
const CAMPOS_DO_PROVEDOR = [
  "prompt",
  "quality",
  "preset_id",
  "image_urls",
  "moderation",
  "resolution",
  "aspect_ratio",
  "enhance_prompt",
];

function pedido(entrada: Record<string, unknown>) {
  return pedidoImagemMarketingSchema.parse({ prompt: "Técnico instalando split", ...entrada });
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `fetch` falso que devolve as respostas na ordem e registra cada chamada. */
function fetchFalso(...respostas: Array<Response | Error>) {
  const chamadas: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const proxima = respostas.shift();
    if (!proxima) throw new Error("teste sem resposta preparada");
    if (proxima instanceof Error) throw proxima;
    return proxima;
  });
  return { impl: impl as unknown as typeof fetch, chamadas };
}

async function capturarErro(promessa: Promise<unknown>): Promise<ImagemMarketingError> {
  try {
    await promessa;
  } catch (error) {
    expect(error).toBeInstanceOf(ImagemMarketingError);
    return error as ImagemMarketingError;
  }
  throw new Error("era esperado um erro");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Pedido — espelho do JSON Schema do provedor", () => {
  it("aplica os padrões do provedor", () => {
    expect(pedido({})).toEqual({
      prompt: "Técnico instalando split",
      qualidade: "high",
      resolucao: "2k",
      proporcao: "auto",
      imagens: [],
      aprimorar: false,
      presetId: undefined,
    });
  });

  it("recusa prompt vazio (depois do trim) e acima de 5.000 caracteres", () => {
    expect(pedidoImagemMarketingSchema.safeParse({ prompt: "   " }).success).toBe(false);
    expect(pedidoImagemMarketingSchema.safeParse({ prompt: "a".repeat(5001) }).success).toBe(false);
    expect(pedidoImagemMarketingSchema.safeParse({ prompt: "a".repeat(5000) }).success).toBe(true);
  });

  it("recusa valor fora dos enums do modelo", () => {
    expect(pedidoImagemMarketingSchema.safeParse({ prompt: "x", qualidade: "ultra" }).success).toBe(false);
    expect(pedidoImagemMarketingSchema.safeParse({ prompt: "x", resolucao: "8k" }).success).toBe(false);
    expect(pedidoImagemMarketingSchema.safeParse({ prompt: "x", proporcao: "5:4" }).success).toBe(false);
  });

  it("aceita até 16 referências https e recusa a 17ª", () => {
    const links = Array.from({ length: 17 }, (_, i) => `https://cdn.exemplo.com/${i}.png`);
    expect(pedidoImagemMarketingSchema.safeParse({ prompt: "x", imagens: links.slice(0, 16) }).success).toBe(true);
    expect(pedidoImagemMarketingSchema.safeParse({ prompt: "x", imagens: links }).success).toBe(false);
  });

  it("só aceita link https como referência", () => {
    for (const link of [
      "http://cdn.exemplo.com/a.png",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "cdn.exemplo.com/a.png",
    ]) {
      expect(pedidoImagemMarketingSchema.safeParse({ prompt: "x", imagens: [link] }).success).toBe(false);
    }
    expect(pedido({ imagens: ["  https://cdn.exemplo.com/a.png  "] }).imagens).toEqual([
      "https://cdn.exemplo.com/a.png",
    ]);
  });

  it("modo com preset exige o preset e 1 ou 2 imagens", () => {
    const semPreset = pedidoImagemMarketingSchema.safeParse({
      prompt: "x",
      aprimorar: true,
      imagens: ["https://cdn.exemplo.com/produto.png"],
    });
    expect(semPreset.success).toBe(false);
    expect(semPreset.error?.issues.map((i) => i.path.join("."))).toContain("presetId");

    const semImagem = pedidoImagemMarketingSchema.safeParse({
      prompt: "x",
      aprimorar: true,
      presetId: PRESET_ID,
    });
    expect(semImagem.success).toBe(false);
    expect(semImagem.error?.issues.map((i) => i.path.join("."))).toContain("imagens");

    const tresImagens = pedidoImagemMarketingSchema.safeParse({
      prompt: "x",
      aprimorar: true,
      presetId: PRESET_ID,
      imagens: ["https://a.com/1.png", "https://a.com/2.png", "https://a.com/3.png"],
    });
    expect(tresImagens.success).toBe(false);

    expect(
      pedido({
        aprimorar: true,
        presetId: PRESET_ID,
        imagens: ["https://a.com/produto.png", "https://a.com/modelo.png"],
      }).presetId,
    ).toBe(PRESET_ID);
  });

  it("descarta o preset fora do modo com preset", () => {
    expect(pedido({ presetId: PRESET_ID }).presetId).toBeUndefined();
  });

  it("id de geração só no formato de UUID", () => {
    expect(requestIdSchema.safeParse(REQUEST_ID).success).toBe(true);
    expect(requestIdSchema.safeParse("../../v1/qualquer-coisa").success).toBe(false);
    expect(requestIdSchema.safeParse(`${REQUEST_ID}/cancel`).success).toBe(false);
  });
});

describe("Credencial Higgsfield — formato KEY_ID:KEY_SECRET", () => {
  it("ausente sem variável (ou só com espaços)", () => {
    expect(lerCredencialHiggsfield({})).toEqual({ estado: "ausente" });
    expect(lerCredencialHiggsfield({ HF_KEY: "   " })).toEqual({ estado: "ausente" });
  });

  it("monta o header Authorization do contrato", () => {
    expect(lerCredencialHiggsfield({ HF_KEY: "abc:def" })).toEqual({
      estado: "ok",
      autorizacao: "Key abc:def",
    });
  });

  it("HF_CREDENTIALS vence HF_KEY, como no SDK; em branco, cai para HF_KEY", () => {
    expect(lerCredencialHiggsfield({ HF_CREDENTIALS: "a:b", HF_KEY: "c:d" })).toEqual({
      estado: "ok",
      autorizacao: "Key a:b",
    });
    expect(lerCredencialHiggsfield({ HF_CREDENTIALS: "  ", HF_KEY: "c:d" })).toEqual({
      estado: "ok",
      autorizacao: "Key c:d",
    });
  });

  it("formato inválido não vira credencial", () => {
    for (const valor of ["sem-dois-pontos", "a:b:c", ":segredo", "id:"]) {
      expect(lerCredencialHiggsfield({ HF_KEY: valor })).toEqual({ estado: "invalida" });
    }
  });
});

describe("Corpo do POST", () => {
  it("geração do zero omite image_urls e preset_id e fixa moderação no padrão", () => {
    const corpo = montarCorpoHiggsfield(pedido({ proporcao: "16:9", qualidade: "max", resolucao: "4k" }));
    expect(corpo).toEqual({
      prompt: "Técnico instalando split",
      quality: "max",
      resolution: "4k",
      aspect_ratio: "16:9",
      moderation: "auto",
      enhance_prompt: false,
    });
  });

  it("edição envia as referências", () => {
    const corpo = montarCorpoHiggsfield(pedido({ imagens: ["https://cdn.exemplo.com/a.png"] }));
    expect(corpo.image_urls).toEqual(["https://cdn.exemplo.com/a.png"]);
    expect(corpo).not.toHaveProperty("preset_id");
  });

  it("modo com preset envia preset_id e enhance_prompt", () => {
    const corpo = montarCorpoHiggsfield(
      pedido({ aprimorar: true, presetId: PRESET_ID, imagens: ["https://a.com/produto.png"] }),
    );
    expect(corpo).toMatchObject({ enhance_prompt: true, preset_id: PRESET_ID });
  });

  it("nunca envia campo que o provedor não conhece", () => {
    const corpo = montarCorpoHiggsfield(
      pedido({ aprimorar: true, presetId: PRESET_ID, imagens: ["https://a.com/p.png"] }),
    );
    for (const campo of Object.keys(corpo)) expect(CAMPOS_DO_PROVEDOR).toContain(campo);
  });
});

describe("Resposta do provedor → GeracaoImagem", () => {
  it("traduz cada status do contrato", () => {
    const esperado = {
      queued: "NA_FILA",
      in_progress: "GERANDO",
      completed: "CONCLUIDA",
      failed: "FALHOU",
      nsfw: "BLOQUEADA",
      canceled: "CANCELADA",
    } as const;
    for (const [doProvedor, nosso] of Object.entries(esperado)) {
      expect(traduzirRespostaHiggsfield({ request_id: REQUEST_ID, status: doProvedor })?.status).toBe(nosso);
    }
  });

  it("status desconhecido segue como em andamento — não encerra o polling por engano", () => {
    const geracao = traduzirRespostaHiggsfield({ request_id: REQUEST_ID, status: "warming_up" });
    expect(geracao?.status).toBe("GERANDO");
    expect(geracaoTerminou(geracao!.status)).toBe(false);
  });

  it("só aceita imagem https vinda do provedor", () => {
    const geracao = traduzirRespostaHiggsfield({
      request_id: REQUEST_ID,
      status: "completed",
      images: [
        { url: "https://cdn.higgsfield.ai/a.png" },
        { url: "http://cdn.higgsfield.ai/b.png" },
        { url: "javascript:alert(1)" },
        { url: "data:text/html,<script>alert(1)</script>" },
        { nada: true },
        null,
      ],
    });
    expect(geracao).toEqual({
      requestId: REQUEST_ID,
      status: "CONCLUIDA",
      imagens: ["https://cdn.higgsfield.ai/a.png"],
    });
  });

  it("falha traz o motivo do provedor, cortado", () => {
    const geracao = traduzirRespostaHiggsfield({
      request_id: REQUEST_ID,
      status: "failed",
      error: "x".repeat(1000),
    });
    expect(geracao?.status).toBe("FALHOU");
    expect(geracao?.erro).toMatch(/^O Higgsfield não concluiu a geração: x+$/);
    expect(geracao!.erro!.length).toBeLessThan(400);
  });

  it("concluída sem imagem utilizável explica o motivo em vez de só dizer pronta", () => {
    const geracao = traduzirRespostaHiggsfield({
      request_id: REQUEST_ID,
      status: "completed",
      images: [{ url: "http://cdn.higgsfield.ai/sem-tls.png" }],
    });
    expect(geracao?.status).toBe("CONCLUIDA");
    expect(geracao?.imagens).toEqual([]);
    expect(geracao?.erro).toMatch(/sem devolver imagem/);
  });

  it("bloqueio pela moderação vira mensagem acionável", () => {
    expect(traduzirRespostaHiggsfield({ request_id: REQUEST_ID, status: "nsfw" })?.erro).toMatch(
      /moderação/,
    );
  });

  it("sem request_id válido não há o que acompanhar", () => {
    expect(traduzirRespostaHiggsfield({ status: "queued" })).toBeNull();
    expect(traduzirRespostaHiggsfield({ request_id: "abc", status: "queued" })).toBeNull();
    expect(traduzirRespostaHiggsfield("ok")).toBeNull();
    expect(traduzirRespostaHiggsfield(null)).toBeNull();
  });
});

describe("Catálogo de presets", () => {
  it("usa só os campos documentados e descarta id fora do formato", () => {
    const pagina = traduzirPresetsHiggsfield({
      total: 3,
      cursor: "pagina-2",
      items: [
        { id: PRESET_ID, type: "ads", name: "Premium Product Ad", segredo_interno: "x" },
        { id: "nao-e-uuid", type: "ads", name: "Quebrado" },
        { id: "00000000-0000-4000-8000-000000000001", name: "Sem tipo" },
      ],
    });
    expect(pagina).toEqual({
      itens: [
        { id: PRESET_ID, nome: "Premium Product Ad", tipo: "ads" },
        { id: "00000000-0000-4000-8000-000000000001", nome: "Sem tipo", tipo: "ads" },
      ],
      cursor: "pagina-2",
    });
  });

  it("cursor nulo encerra a paginação; formato torto é recusado", () => {
    expect(traduzirPresetsHiggsfield({ items: [], cursor: null })).toEqual({ itens: [], cursor: null });
    expect(traduzirPresetsHiggsfield({ items: "não" })).toBeNull();
  });
});

describe("detail do provedor (formato FastAPI, como o SDK lê)", () => {
  it("texto, lista {loc,msg} e lixo", () => {
    expect(descreverDetalheHiggsfield({ detail: "prompt too long" })).toBe("prompt too long");
    expect(
      descreverDetalheHiggsfield({
        detail: [
          { loc: ["body", "image_urls"], msg: "too many items" },
          { loc: ["body", "preset_id"], msg: "invalid uuid" },
        ],
      }),
    ).toBe("body.image_urls: too many items; body.preset_id: invalid uuid");
    expect(descreverDetalheHiggsfield({ detail: [{ nada: 1 }] })).toBeNull();
    expect(descreverDetalheHiggsfield(null)).toBeNull();
  });
});

describe("Adapter HTTP — contrato do SDK @higgsfield/client 0.2.6", () => {
  it("gerar: POST no endpoint do modelo, com a credencial no header", async () => {
    const { impl, chamadas } = fetchFalso(
      respostaJson({ request_id: REQUEST_ID, status: "queued", status_url: "https://x", cancel_url: "https://y" }),
    );
    const provedor = new HiggsfieldImagemProvider(AUTORIZACAO, impl);
    const entrada = pedido({ proporcao: "1:1" });

    const geracao = await provedor.gerar(entrada, CID);

    expect(geracao).toEqual({ requestId: REQUEST_ID, status: "NA_FILA", imagens: [] });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe("https://api.higgsfield.ai/marketing-studio/image/sunburst");
    expect(chamadas[0].init.method).toBe("POST");
    const headers = chamadas[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe(AUTORIZACAO);
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual(montarCorpoHiggsfield(entrada));
  });

  it("consultar: GET no endpoint de status compartilhado", async () => {
    const { impl, chamadas } = fetchFalso(
      respostaJson({
        request_id: REQUEST_ID,
        status: "completed",
        images: [{ url: "https://cdn.higgsfield.ai/pronta.png" }],
      }),
    );
    const geracao = await new HiggsfieldImagemProvider(AUTORIZACAO, impl).consultar(REQUEST_ID, CID);

    expect(chamadas[0].url).toBe(`https://api.higgsfield.ai/requests/${REQUEST_ID}/status`);
    expect(chamadas[0].init.method).toBe("GET");
    expect(chamadas[0].init.body).toBeUndefined();
    expect(geracao.status).toBe("CONCLUIDA");
    expect(geracao.imagens).toEqual(["https://cdn.higgsfield.ai/pronta.png"]);
  });

  it("consultar: id fora do formato nem chega à rede", async () => {
    const { impl, chamadas } = fetchFalso();
    const erro = await capturarErro(
      new HiggsfieldImagemProvider(AUTORIZACAO, impl).consultar("../../v1/models", CID),
    );
    expect(erro.code).toBe("MARKETING_GERACAO_NAO_ENCONTRADA");
    expect(chamadas).toHaveLength(0);
  });

  it("presets: GET paginado, cursor codificado na query", async () => {
    const { impl, chamadas } = fetchFalso(respostaJson({ total: 0, cursor: null, items: [] }));
    await new HiggsfieldImagemProvider(AUTORIZACAO, impl).listarPresets("a b&c=d", CID);

    const url = new URL(chamadas[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.higgsfield.ai/marketing-studio/image/presets",
    );
    expect(url.searchParams.get("size")).toBe("50");
    expect(url.searchParams.get("cursor")).toBe("a b&c=d");
    expect([...url.searchParams.keys()].sort()).toEqual(["cursor", "size"]);
  });

  it.each([
    [401, "MARKETING_CREDENCIAIS_RECUSADAS", {}],
    [403, "MARKETING_SEM_CREDITOS", {}],
    [404, "MARKETING_GERACAO_NAO_ENCONTRADA", {}],
    [429, "MARKETING_LIMITE_PROVEDOR", {}],
    [422, "MARKETING_PEDIDO_RECUSADO", { detail: [{ loc: ["body", "prompt"], msg: "too long" }] }],
    [400, "MARKETING_PEDIDO_RECUSADO", { detail: "bad input" }],
    [500, "MARKETING_PROVEDOR_INDISPONIVEL", {}],
    [503, "MARKETING_PROVEDOR_INDISPONIVEL", {}],
  ])("HTTP %i vira %s, sem vazar a credencial", async (status, codigo, corpo) => {
    const { impl } = fetchFalso(respostaJson(corpo, status));
    const erro = await capturarErro(new HiggsfieldImagemProvider(AUTORIZACAO, impl).gerar(pedido({}), CID));
    expect(erro.code).toBe(codigo);
    expect(`${erro.code} ${erro.message}`).not.toContain(SEGREDO);
  });

  it("detalhe do 422 chega ao operador", async () => {
    const { impl } = fetchFalso(
      respostaJson({ detail: [{ loc: ["body", "prompt"], msg: "too long" }] }, 422),
    );
    const erro = await capturarErro(new HiggsfieldImagemProvider(AUTORIZACAO, impl).gerar(pedido({}), CID));
    expect(erro.message).toBe("O Higgsfield recusou o pedido: body.prompt: too long");
  });

  it("falha de rede, JSON torto e resposta sem request_id viram indisponível — e o log não leva a credencial", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const casos: Array<Response | Error> = [
      new TypeError(`fetch failed: ${AUTORIZACAO}`),
      new Response("<html>gateway</html>", { status: 200 }),
      respostaJson({ status: "queued" }),
    ];
    for (const caso of casos) {
      const { impl } = fetchFalso(caso);
      const erro = await capturarErro(new HiggsfieldImagemProvider(AUTORIZACAO, impl).gerar(pedido({}), CID));
      expect(erro.code).toBe("MARKETING_PROVEDOR_INDISPONIVEL");
      expect(erro.message).not.toContain(SEGREDO);
    }
    expect(logs).toHaveBeenCalled();
    expect(JSON.stringify(logs.mock.calls)).not.toContain(SEGREDO);
  });
});

describe("Sandbox", () => {
  it("enfileira sem custo e conclui na primeira consulta com uma prévia exibível", async () => {
    const sandbox = new SandboxImagemProvider();
    const pedidoFeito = await sandbox.gerar(pedido({}), CID);
    expect(pedidoFeito.status).toBe("NA_FILA");
    expect(requestIdSchema.safeParse(pedidoFeito.requestId).success).toBe(true);

    const pronta = await sandbox.consultar(pedidoFeito.requestId);
    expect(pronta.status).toBe("CONCLUIDA");
    expect(pronta.imagens).toHaveLength(1);
    expect(pronta.imagens[0]).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(linkDeImagemExibivel(pronta.imagens[0])).toBe(true);
    expect(decodeURIComponent(pronta.imagens[0])).toContain(pedidoFeito.requestId.slice(0, 8));
  });

  it("presets fictícios passam na validação do modo com preset", async () => {
    const { itens } = await new SandboxImagemProvider().listarPresets();
    expect(itens.length).toBeGreaterThan(0);
    for (const preset of itens) {
      expect(preset.nome).toMatch(/sandbox/i);
      expect(
        pedidoImagemMarketingSchema.safeParse({
          prompt: "x",
          aprimorar: true,
          presetId: preset.id,
          imagens: ["https://a.com/produto.png"],
        }).success,
      ).toBe(true);
    }
  });
});

describe("Vocabulário compartilhado", () => {
  it("só https e a prévia SVG do sandbox viram link no painel", () => {
    expect(linkDeImagemExibivel("https://cdn.higgsfield.ai/a.png")).toBe(true);
    expect(linkDeImagemExibivel("data:image/svg+xml;charset=utf-8,%3Csvg%3E")).toBe(true);
    expect(linkDeImagemExibivel("http://cdn.higgsfield.ai/a.png")).toBe(false);
    expect(linkDeImagemExibivel("javascript:alert(1)")).toBe(false);
    expect(linkDeImagemExibivel("data:text/html,<script>")).toBe(false);
    expect(linkDeImagemExibivel("")).toBe(false);
  });

  it("status terminais param o polling; fila e geração, não", () => {
    const terminais = STATUS_GERACAO.filter(geracaoTerminou);
    expect(terminais).toEqual(["CONCLUIDA", "FALHOU", "BLOQUEADA", "CANCELADA"]);
  });
});
