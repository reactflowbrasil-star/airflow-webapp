/**
 * Provedor de desenvolvimento do estúdio de marketing.
 *
 * Não fala com ninguém e não cobra nada: enfileira "de mentira", conclui na
 * primeira consulta com uma prévia SVG e oferece dois presets fictícios —
 * o bastante para exercitar formulário, polling, histórico e auditoria sem
 * gastar crédito. Sem estado em memória de propósito: em `next dev` cada
 * rota pode carregar a própria cópia do módulo, e um Map aqui sumiria entre
 * o POST e o polling.
 */

import type { GeracaoImagem, PaginaPresets } from "@/lib/marketing-image";
import type { PedidoImagemMarketing } from "@/lib/validation/marketing";
import { logger } from "@/server/observability/logger";

import type { ImagemMarketingProvider } from "./image-provider";

/** Ids fixos e rotulados como sandbox — nunca confundidos com o catálogo real. */
const PRESETS_SANDBOX: PaginaPresets = {
  itens: [
    {
      id: "00000000-0000-4000-8000-00000000a001",
      nome: "Anúncio premium (sandbox)",
      tipo: "ads",
    },
    {
      id: "00000000-0000-4000-8000-00000000a002",
      nome: "Produto em estúdio (sandbox)",
      tipo: "ads",
    },
  ],
  cursor: null,
};

/** Prévia com a identidade do produto; o trecho do id liga a imagem ao histórico. */
export function previaSandbox(requestId: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#8B6CF7"/><stop offset=".55" stop-color="#6F42F5"/><stop offset="1" stop-color="#4B2ACF"/>
</linearGradient></defs>
<rect width="1024" height="1024" fill="url(#g)"/>
<circle cx="800" cy="230" r="190" fill="#A88BFF" opacity=".55"/>
<text x="88" y="560" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="68" font-weight="800" fill="#FFFFFF">Prévia do sandbox</text>
<text x="88" y="636" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="34" fill="#EFE8FF">Configure HF_KEY para gerar de verdade</text>
<text x="88" y="940" font-family="monospace" font-size="28" fill="#EFE8FF">${requestId.replace(/[^0-9a-f-]/gi, "").slice(0, 8)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class SandboxImagemProvider implements ImagemMarketingProvider {
  readonly id = "sandbox";
  readonly modo = "sandbox" as const;
  readonly modelo = "sandbox";

  async gerar(pedido: PedidoImagemMarketing, correlationId: string): Promise<GeracaoImagem> {
    const requestId = crypto.randomUUID();
    logger.info("Estúdio de marketing (sandbox) — geração simulada, nada foi cobrado", {
      correlationId,
      requestId,
      proporcao: pedido.proporcao,
      aprimorar: pedido.aprimorar,
    });
    return { requestId, status: "NA_FILA", imagens: [] };
  }

  async consultar(requestId: string): Promise<GeracaoImagem> {
    return { requestId, status: "CONCLUIDA", imagens: [previaSandbox(requestId)] };
  }

  async listarPresets(): Promise<PaginaPresets> {
    return PRESETS_SANDBOX;
  }
}
