import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { ServiceWorkerRegistration } from "@/ui/service-worker-registration";

import "./globals.css";

/**
 * Inter — tipografia do design system (Figma "AirFlow Desktop UI").
 * Carregada por next/font: a fonte é auto-hospedada no build, sem requisição
 * a terceiros em runtime e sem o salto de layout que degradaria o LCP.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://airflow.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AirFlow — Técnicos de ar-condicionado perto de você",
    template: "%s | AirFlow",
  },
  description:
    "Encontre profissionais de climatização próximos, negocie o valor e contrate serviços de ar-condicionado com pagamento seguro.",
  applicationName: "AirFlow",
  keywords: [
    "ar-condicionado",
    "climatização",
    "limpeza de ar-condicionado",
    "instalação de ar-condicionado",
    "técnico de refrigeração",
  ],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "AirFlow",
    title: "AirFlow — Seu ar-condicionado nas mãos de quem entende",
    description:
      "Encontre profissionais próximos, negocie o valor e contrate serviços de climatização com segurança.",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AirFlow", statusBarStyle: "default" },
  // Declarados explicitamente: sem isso o navegador busca /apple-touch-icon.png
  // na raiz por convenção e recebe 404.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  // Tema único com fundo branco — a barra do navegador acompanha a página.
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <a
          href="#conteudo"
          className="bg-grad sr-only rounded-(--radius-pill) px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          Pular para o conteúdo
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
