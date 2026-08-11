import type { MetadataRoute } from "next";

/** Manifest do PWA (§46). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AirFlow — Marketplace de Climatização",
    short_name: "AirFlow",
    description:
      "Encontre técnicos de ar-condicionado próximos, negocie o valor e contrate com pagamento protegido.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#100C21",
    theme_color: "#7A5CF0",
    lang: "pt-BR",
    categories: ["business", "utilities"],
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
      { name: "Encontrar técnico", url: "/tecnicos" },
      { name: "Minhas solicitações", url: "/app/solicitacoes" },
    ],
  };
}
