import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ErroHiggsfield,
  baseUrlHiggsfield,
  criarClienteHiggsfield,
  validarTicketUpload,
} from "@/server/higgsfield/cliente";

const CHAVE = "35bfake0-0000-4000-8000-000000000000:fakesecretfakesecretfakesecret";
const BASE = "https://api.higgsfield.test";

interface Chamada {
  url: string;
  metodo: string;
  headers: Record<string, string>;
  corpo: unknown;
}

/** fetch falso: devolve as respostas na ordem e registra o que foi pedido. */
function fetchFalso(...respostas: Array<Response | Error>) {
  const chamadas: Chamada[] = [];
  const fila = [...respostas];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      url: String(url),
      metodo: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const proxima = fila.shift();
    if (!proxima) throw new Error("resposta não configurada");
    if (proxima instanceof Error) throw proxima;
    return proxima;
  });
  return { fn: fn as unknown as typeof fetch, chamadas };
}

function json(status: number, corpo: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function capturar(promessa: Promise<unknown>): Promise<ErroHiggsfield> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof ErroHiggsfield) return erro;
    throw erro;
  }
  throw new Error("esperava ErroHiggsfield");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("envio (POST /<modelo>)", () => {
  it("manda a chave exatamente como colada no esquema Key", async () => {
    for (const apiKey of [CHAVE, "hf_chave_sem_dois_pontos"]) {
      const { fn, chamadas } = fetchFalso(json(200, { status: "queued", request_id: "req-1" }));
      const cliente = criarClienteHiggsfield({ apiKey, baseUrl: BASE, fetch: fn });
      await cliente.enviar("marketing-studio/image/sunburst", { prompt: "x" });
      expect(chamadas[0].headers.authorization).toBe(`Key ${apiKey}`);
    }
  });

  it("POST no caminho do modelo com o corpo em JSON", async () => {
    const { fn, chamadas } = fetchFalso(
      json(200, {
        status: "queued",
        request_id: "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff",
        status_url: `${BASE}/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status`,
        cancel_url: `${BASE}/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/cancel`,
      }),
    );
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: `${BASE}/`, fetch: fn });
    const resposta = await cliente.enviar("bytedance/seedance-2.5/text-to-video", {
      prompt: "A cinematic scene at sunset",
      duration: 5,
    });
    expect(resposta).toEqual({ requestId: "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff", status: "queued" });
    expect(chamadas[0]).toMatchObject({
      url: `${BASE}/bytedance/seedance-2.5/text-to-video`,
      metodo: "POST",
      corpo: { prompt: "A cinematic scene at sunset", duration: 5 },
    });
    expect(chamadas[0].headers["content-type"]).toBe("application/json");
  });

  it("recusa caminho de modelo suspeito sem chamar a rede", async () => {
    const { fn } = fetchFalso();
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    const erro = await capturar(cliente.enviar("../files/generate-upload-url", {}));
    expect(erro.tipo).toBe("ENTRADA_INVALIDA");
    expect(fn).not.toHaveBeenCalled();
  });

  it("2xx sem request_id é resultado incerto", async () => {
    const { fn } = fetchFalso(json(200, { status: "queued" }));
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    const erro = await capturar(cliente.enviar("marketing-studio/image/sunburst", { prompt: "x" }));
    expect(erro.tipo).toBe("RESPOSTA_INVALIDA");
    expect(erro.resultadoIncerto).toBe(true);
  });
});

describe("classificação de erros", () => {
  const casos: Array<[string, Response | Error, string, boolean]> = [
    ["401", json(401, { detail: "Invalid credentials" }), "CHAVE_RECUSADA", false],
    ["402", json(402, { detail: "Payment required" }), "SEM_CREDITOS_OU_ACESSO", false],
    ["403", json(403, { detail: "Not enough credits" }), "SEM_CREDITOS_OU_ACESSO", false],
    ["404", json(404, { detail: "Not found" }), "NAO_ENCONTRADO", false],
    ["409", json(409, { detail: "Request already started" }), "CONFLITO", false],
    ["429", json(429, { detail: "Too many requests" }), "LIMITE", false],
    ["500", json(500, { detail: "boom" }), "INDISPONIVEL", true],
    ["502 sem corpo", new Response("", { status: 502 }), "INDISPONIVEL", true],
    [
      "conexão recusada",
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      }),
      "SEM_CONEXAO",
      false,
    ],
    [
      "DNS",
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
      }),
      "SEM_CONEXAO",
      false,
    ],
    ["timeout", new DOMException("The operation was aborted due to timeout", "TimeoutError"), "SEM_RESPOSTA", true],
    [
      "queda de socket",
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
      }),
      "SEM_RESPOSTA",
      true,
    ],
  ];

  it.each(casos)("%s → %s", async (_nome, resposta, tipo, incerto) => {
    const { fn } = fetchFalso(resposta);
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    const erro = await capturar(cliente.enviar("marketing-studio/image/sunburst", { prompt: "x" }));
    expect(erro.tipo).toBe(tipo);
    expect(erro.resultadoIncerto).toBe(incerto);
    expect(erro.message).not.toContain(CHAVE);
    expect(erro.message).not.toContain("fakesecret");
  });

  it("429 carrega o Retry-After", async () => {
    const { fn } = fetchFalso(json(429, { detail: "slow down" }, { "retry-after": "7" }));
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    const erro = await capturar(cliente.consultar("req-1"));
    expect(erro.retryAfterSegundos).toBe(7);
  });

  it("422 resume o detail de validação sem ecoar a entrada", async () => {
    const { fn } = fetchFalso(
      json(422, {
        detail: [
          {
            type: "enum",
            loc: ["body", "resolution"],
            msg: "Input should be '1k', '2k' or '4k'",
            input: "prompt secreto de campanha",
          },
        ],
      }),
    );
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    const erro = await capturar(cliente.enviar("marketing-studio/image/sunburst", { prompt: "x" }));
    expect(erro.tipo).toBe("ENTRADA_INVALIDA");
    expect(erro.message).toContain("resolution: Input should be '1k', '2k' or '4k'");
    expect(erro.message).not.toContain("prompt secreto");
  });
});

describe("status (GET /requests/{id}/status)", () => {
  it("devolve só URLs https de imagens e vídeo", async () => {
    const { fn, chamadas } = fetchFalso(
      json(200, {
        status: "completed",
        request_id: "req/1",
        images: [
          { url: "https://cdn.higgsfield.ai/a.png" },
          { url: "http://cdn.higgsfield.ai/inseguro.png" },
          { url: "javascript:alert(1)" },
          { nada: true },
        ],
        video: { url: "https://cdn.higgsfield.ai/v.mp4" },
      }),
    );
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    const status = await cliente.consultar("req/1");
    expect(chamadas[0].url).toBe(`${BASE}/requests/req%2F1/status`);
    expect(status).toEqual({
      requestId: "req/1",
      status: "completed",
      urls: ["https://cdn.higgsfield.ai/a.png", "https://cdn.higgsfield.ai/v.mp4"],
      erro: null,
    });
  });

  it("failed traz o motivo; resposta sem status é inválida", async () => {
    const { fn } = fetchFalso(
      json(200, { status: "failed", request_id: "r", error: "Upstream model error" }),
      json(200, { request_id: "r" }),
    );
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    expect((await cliente.consultar("r")).erro).toBe("Upstream model error");
    expect((await capturar(cliente.consultar("r"))).tipo).toBe("RESPOSTA_INVALIDA");
  });
});

describe("cancelamento", () => {
  it("POST /requests/{id}/cancel chega à API", async () => {
    const { fn, chamadas } = fetchFalso(new Response(null, { status: 202 }));
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    await cliente.cancelar("req-9");
    expect(chamadas[0]).toMatchObject({ url: `${BASE}/requests/req-9/cancel`, metodo: "POST", corpo: {} });
  });
});

describe("upload assinado", () => {
  const ticket = {
    upload_url: "https://storage.higgsfield.test/put?sig=abc",
    public_url: "https://cdn.higgsfield.test/ref.png",
    content_type: "image/png",
    upload_headers: { "Content-Type": "image/png", "x-amz-acl": "private" },
  };

  it("pede a URL com a chave e devolve o ticket validado", async () => {
    const { fn, chamadas } = fetchFalso(json(200, ticket));
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    const resultado = await cliente.criarUpload("image/png");
    expect(chamadas[0]).toMatchObject({
      url: `${BASE}/files/generate-upload-url`,
      metodo: "POST",
      corpo: { content_type: "image/png" },
    });
    expect(chamadas[0].headers.authorization).toBe(`Key ${CHAVE}`);
    expect(resultado).toEqual({
      uploadUrl: ticket.upload_url,
      publicUrl: ticket.public_url,
      contentType: "image/png",
      uploadHeaders: ticket.upload_headers,
    });
  });

  it("recusa ticket que mandaria credencial ao storage ou fora de https", () => {
    const invalidos: unknown[] = [
      { ...ticket, upload_url: "http://storage.higgsfield.test/put" },
      { ...ticket, public_url: "https://user:senha@cdn.higgsfield.test/ref.png" },
      { ...ticket, upload_headers: { ...ticket.upload_headers, Authorization: "Key vazada" } },
      { ...ticket, upload_headers: { cookie: "sessao=1" } },
      { ...ticket, upload_headers: { "Content-Type": "image/jpeg" } },
      { ...ticket, upload_headers: { "x-num": 1 } },
      { ...ticket, content_type: "image/jpeg" },
      { ...ticket, upload_headers: ["Content-Type: image/png"] },
      null,
    ];
    for (const valor of invalidos) {
      expect(() => validarTicketUpload(valor, "image/png")).toThrow(ErroHiggsfield);
    }
  });

  it("sem upload_headers o ticket ainda vale (a doc da tarefa não os exige)", () => {
    const minimo = { upload_url: ticket.upload_url, public_url: ticket.public_url };
    expect(validarTicketUpload(minimo, "image/webp").uploadHeaders).toEqual({});
  });
});

describe("presets do Marketing Studio", () => {
  it("pagina pelo cursor e ignora item sem id ou nome", async () => {
    const { fn, chamadas } = fetchFalso(
      json(200, {
        total: 3,
        cursor: "c2",
        items: [
          { id: "7e68c81e-5f97-4f48-bcab-f0d4dd75a99d", type: "ads", name: "Premium Product Ad" },
          { id: "sem-nome" },
          { name: "sem id" },
        ],
      }),
      json(200, { total: 3, cursor: null, items: [] }),
    );
    const cliente = criarClienteHiggsfield({ apiKey: CHAVE, baseUrl: BASE, fetch: fn });
    const primeira = await cliente.listarPresets(null);
    expect(primeira).toEqual({
      itens: [{ id: "7e68c81e-5f97-4f48-bcab-f0d4dd75a99d", nome: "Premium Product Ad", tipo: "ads" }],
      cursor: "c2",
    });
    expect(chamadas[0].url).toBe(`${BASE}/marketing-studio/image/presets?size=50`);
    expect((await cliente.listarPresets("c2")).cursor).toBeNull();
    expect(chamadas[1].url).toBe(`${BASE}/marketing-studio/image/presets?size=50&cursor=c2`);
  });
});

describe("base da API", () => {
  it("usa o endereço oficial quando não configurada", () => {
    vi.stubEnv("HF_API_BASE_URL", "");
    expect(baseUrlHiggsfield()).toBe("https://api.higgsfield.ai");
  });

  it("respeita HF_API_BASE_URL sem barra final", () => {
    vi.stubEnv("HF_API_BASE_URL", "https://proxy.interno.test/");
    expect(baseUrlHiggsfield()).toBe("https://proxy.interno.test");
  });
});
