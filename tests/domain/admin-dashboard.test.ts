import { describe, expect, it } from "vitest";

import {
  distribuicaoStatus,
  geometriaSerie,
  seriePorDia,
  STATUS_ORDEM,
  type PedidoParaSerie,
} from "@/lib/admin-dashboard";

const HOJE = new Date("2026-08-12T12:00:00Z");

/** Pedido criado `diasAtras` dias antes de HOJE. */
function pedido(
  diasAtras: number,
  extras: Partial<PedidoParaSerie> = {},
): PedidoParaSerie {
  const data = new Date(HOJE);
  data.setDate(data.getDate() - diasAtras);
  return {
    createdAt: data,
    status: "PAGA",
    grossAmountCents: 10000,
    commissionAmountCents: 1500,
    ...extras,
  };
}

describe("seriePorDia — série diária do painel", () => {
  it("devolve um ponto por dia na janela, sempre na ordem cronológica", () => {
    const serie = seriePorDia([], 14, HOJE);
    expect(serie).toHaveLength(14);
    expect(serie[0].dia).toBe("2026-07-30");
    expect(serie.at(-1)?.dia).toBe("2026-08-12");
  });

  it("preenche dias sem pedidos com zero (sem buracos no gráfico)", () => {
    const serie = seriePorDia([pedido(0)], 14, HOJE);
    expect(serie.at(-1)?.pedidos).toBe(1);
    // Hoje-1 não teve pedido → zero
    expect(serie.at(-2)?.pedidos).toBe(0);
    expect(serie.at(-2)?.brutoCents).toBe(0);
  });

  it("soma valores por dia", () => {
    const serie = seriePorDia(
      [
        pedido(0, { grossAmountCents: 30000, commissionAmountCents: 4500 }),
        pedido(0, { grossAmountCents: 10000, commissionAmountCents: 1500 }),
        pedido(3, { status: "CANCELADA", grossAmountCents: 5000, commissionAmountCents: 0 }),
      ],
      14,
      HOJE,
    );
    expect(serie.at(-1)?.pedidos).toBe(2);
    expect(serie.at(-1)?.brutoCents).toBe(40000);
    expect(serie.at(-1)?.comissaoCents).toBe(6000);
    // 3 dias atrás
    const tresDiasAtras = serie.at(-4);
    expect(tresDiasAtras?.pedidos).toBe(1);
    expect(tresDiasAtras?.brutoCents).toBe(5000);
  });

  it("mantém o total por dia invariante à ordem da entrada", () => {
    const a = seriePorDia([pedido(1), pedido(1), pedido(5)], 14, HOJE);
    const b = seriePorDia([pedido(5), pedido(1), pedido(1)], 14, HOJE);
    expect(a).toEqual(b);
  });

  it("formata o rótulo no padrão dd/mm", () => {
    const serie = seriePorDia([], 1, HOJE);
    expect(serie[0].rotulo).toBe("12/08");
  });
});

describe("distribuicaoStatus — gráfico de status", () => {
  it("conta por status e ordena da maior para a menor", () => {
    const distribuicao = distribuicaoStatus([
      { status: "PAGA" },
      { status: "CANCELADA" },
      { status: "PAGA" },
      { status: "LIQUIDADA" },
      { status: "PAGA" },
    ]);
    expect(distribuicao).toEqual([
      { status: "PAGA", contagem: 3 },
      { status: "CANCELADA", contagem: 1 },
      { status: "LIQUIDADA", contagem: 1 },
    ]);
  });

  it("devolve lista vazia sem pedidos", () => {
    expect(distribuicaoStatus([])).toEqual([]);
  });
});

describe("geometriaSerie — projeção SVG do gráfico", () => {
  const serie = seriePorDia(
    [pedido(0, { grossAmountCents: 10000 }), pedido(1, { grossAmountCents: 40000 })],
    2,
    HOJE,
  );

  it("o pico fica dentro da área com 6px de respiro no topo", () => {
    const g = geometriaSerie(serie, "brutoCents", 560, 160);
    expect(g.max).toBe(40000);
    // Ontem (40000) é o pico → 6px de respiro; hoje (10000) fica mais baixo.
    expect(g.pontos[0].y).toBe(6);
    expect(g.pontos.at(-1)?.y).toBe(160 - (10000 / 40000) * 154);
  });

  it("x avança de forma monotônica do primeiro ao último dia", () => {
    const g = geometriaSerie(serie, "brutoCents", 560, 160);
    expect(g.pontos[0].x).toBe(0);
    expect(g.pontos.at(-1)?.x).toBe(560);
    for (let i = 1; i < g.pontos.length; i++) {
      expect(g.pontos[i].x).toBeGreaterThan(g.pontos[i - 1].x);
    }
  });

  it("a área fecha na base do gráfico (polígono sem buracos)", () => {
    const g = geometriaSerie(serie, "brutoCents", 560, 160);
    expect(g.area).toMatch(/^M 0,160 L /);
    expect(g.area.endsWith("L 560,160 Z")).toBe(true);
  });

  it("linha vazia e área vazia para série sem pontos", () => {
    const g = geometriaSerie([], "brutoCents", 560, 160);
    expect(g.linha).toBe("");
    expect(g.area).toBe("");
    expect(g.max).toBe(0);
  });

  it("série toda zerada não divide por zero", () => {
    const g = geometriaSerie(seriePorDia([], 7, HOJE), "brutoCents", 560, 160);
    expect(g.max).toBe(0);
    expect(g.pontos.every((p) => p.y === 160)).toBe(true);
  });
});

describe("STATUS_ORDEM — rótulos compartilhados", () => {
  it("cobre todos os estados da máquina de estados da ordem", () => {
    const estados = [
      "CRIADA",
      "AGUARDANDO_PAGAMENTO",
      "PAGA",
      "AUTORIZADA",
      "EM_EXECUCAO",
      "CONCLUIDA",
      "LIQUIDADA",
      "CANCELADA",
      "EM_DISPUTA",
      "ESTORNADA",
    ];
    for (const estado of estados) {
      expect(STATUS_ORDEM[estado], `faltou o rótulo de ${estado}`).toBeDefined();
    }
  });
});
