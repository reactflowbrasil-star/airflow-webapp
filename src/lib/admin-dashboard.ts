/**
 * Lógica pura do painel administrativo — séries e distribuições derivadas dos
 * dados brutos do banco. Separada da página para ser testável sem banco: a
 * página só monta a árvore de UI com o que estes helpers devolvem.
 */

export interface PedidoParaSerie {
  createdAt: Date;
  status: string;
  grossAmountCents: number;
  commissionAmountCents: number;
}

export interface PontoSerieDia {
  /** ISO yyyy-mm-dd, no fuso do servidor. */
  readonly dia: string;
  readonly rotulo: string;
  readonly pedidos: number;
  readonly brutoCents: number;
  readonly comissaoCents: number;
}

function chaveDia(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/**
 * Agrupa pedidos por dia nos últimos `dias` dias, preenchendo dias vazios com
 * zero — um gráfico de área com buracos mente mais do que informa.
 */
export function seriePorDia(
  pedidos: readonly PedidoParaSerie[],
  dias: number,
  hoje: Date = new Date(),
): PontoSerieDia[] {
  const porDia = new Map<string, PedidoParaSerie[]>();
  for (const pedido of pedidos) {
    const chave = chaveDia(pedido.createdAt);
    const lista = porDia.get(chave) ?? [];
    lista.push(pedido);
    porDia.set(chave, lista);
  }

  const pontos: PontoSerieDia[] = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    const data = new Date(hoje);
    data.setDate(data.getDate() - i);
    const lista = porDia.get(chaveDia(data)) ?? [];
    pontos.push({
      dia: chaveDia(data),
      rotulo: data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      pedidos: lista.length,
      brutoCents: lista.reduce((soma, p) => soma + p.grossAmountCents, 0),
      comissaoCents: lista.reduce((soma, p) => soma + p.commissionAmountCents, 0),
    });
  }
  return pontos;
}

export interface ContagemStatus {
  readonly status: string;
  readonly contagem: number;
}

/** Distribuição de pedidos por status, da maior para a menor contagem. */
export function distribuicaoStatus(
  pedidos: readonly Pick<PedidoParaSerie, "status">[],
): ContagemStatus[] {
  const porStatus = new Map<string, number>();
  for (const pedido of pedidos) {
    porStatus.set(pedido.status, (porStatus.get(pedido.status) ?? 0) + 1);
  }
  return [...porStatus.entries()]
    .map(([status, contagem]) => ({ status, contagem }))
    .sort((a, b) => b.contagem - a.contagem);
}

/* -------------------------------------------------------------------------- */
/* Geometria do gráfico SVG — pura, testável sem banco                        */
/* -------------------------------------------------------------------------- */

export interface GeometriaSerie {
  readonly max: number;
  readonly pontos: readonly { x: number; y: number; dia: string }[];
  /** Path fechado (preenchimento do gráfico de área). */
  readonly area: string;
  /** Path de linha (contorno). */
  readonly linha: string;
}

/**
 * Projeta uma série em coordenadas SVG. O gráfico é renderizado no servidor
 * como SVG puro — sem lib de charts — então a geometria precisa viver fora da
 * página para ser testada: um eixo que estoura a borda ou inverte a ordem
 * dos dias é defeito que só aparece com dados reais.
 */
export function geometriaSerie(
  pontos: readonly PontoSerieDia[],
  chave: "pedidos" | "brutoCents" | "comissaoCents",
  largura: number,
  altura: number,
): GeometriaSerie {
  const valores = pontos.map((p) => p[chave]);
  const max = Math.max(0, ...valores);
  // 6px de respiro: um pico colado na borda do card parece cortado.
  const escala = max > 0 ? (altura - 6) / max : 0;
  const passo = pontos.length > 1 ? largura / (pontos.length - 1) : 0;
  const pts = pontos.map((p, i) => ({
    x: Math.round(i * passo * 10) / 10,
    y: Math.round((altura - p[chave] * escala) * 10) / 10,
    dia: p.dia,
  }));
  if (pts.length === 0) {
    return { max, pontos: pts, area: "", linha: "" };
  }
  const linha = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `M ${pts[0].x},${altura} L ${pts
    .map((p) => `${p.x},${p.y}`)
    .join(" L ")} L ${pts.at(-1)!.x},${altura} Z`;
  return { max, pontos: pts, area, linha };
}

/* -------------------------------------------------------------------------- */
/* Rótulos de status da ordem — compartilhados pelas telas do admin           */
/* -------------------------------------------------------------------------- */

export type TomBadge = "neutral" | "brand" | "success" | "warning" | "danger" | "ice";

export const STATUS_ORDEM: Record<string, { rotulo: string; tom: TomBadge }> = {
  CRIADA: { rotulo: "Criada", tom: "neutral" },
  AGUARDANDO_PAGAMENTO: { rotulo: "Aguardando pagamento", tom: "warning" },
  PAGA: { rotulo: "Paga", tom: "brand" },
  AUTORIZADA: { rotulo: "Agendada", tom: "brand" },
  EM_EXECUCAO: { rotulo: "Em execução", tom: "brand" },
  CONCLUIDA: { rotulo: "Concluída", tom: "success" },
  LIQUIDADA: { rotulo: "Liquidada", tom: "success" },
  CANCELADA: { rotulo: "Cancelada", tom: "neutral" },
  EM_DISPUTA: { rotulo: "Em disputa", tom: "danger" },
  ESTORNADA: { rotulo: "Estornada", tom: "danger" },
};
