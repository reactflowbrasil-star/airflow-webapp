import { NextResponse } from "next/server";

/**
 * Manifesto dedicado ao app do prestador.
 *
 * O app geral continua em `/manifest.webmanifest`; este começa em `/pro` e
 * mostra atalhos de operação para que o técnico instale um ícone separado no
 * celular sem criar outro backend nem cachear rotas sensíveis.
 */
export function GET() {
  return NextResponse.json({
    name: "AirFlow Prestador — App do Técnico",
    short_name: "AirFlow Pro",
    description:
      "Receba alertas de serviços próximos, negocie pedidos, acompanhe agenda e financeiro.",
    start_url: "/pro?origem=pwa-prestador",
    scope: "/pro",
    display: "standalone",
    orientation: "portrait",
    background_color: "#100C21",
    theme_color: "#16A3FF",
    lang: "pt-BR",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Alertas de pedidos", short_name: "Alertas", url: "/pro/solicitacoes" },
      { name: "Agenda de serviços", short_name: "Agenda", url: "/pro/agenda" },
      { name: "Financeiro", short_name: "Caixa", url: "/pro/financeiro" },
    ],
  });
}
