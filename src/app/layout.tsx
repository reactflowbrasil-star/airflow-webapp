import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistration } from "@/ui/service-worker-registration";

import "./globals.css";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a
          href="#conteudo"
          className="bg-brand-600 sr-only rounded px-4 py-2 text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          Pular para o conteúdo
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
