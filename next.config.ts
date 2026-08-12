import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Limita os workers de build/prerender. O padrão do Next segue o número de
   * CPUs do host; em ambientes de preview/CI com muitos vCPUs e cgroup de
   * memória apertado (2 GiB), 63 workers derrubam o build com OOM (exit 137).
   * 4 workers bastam e o build fica determinístico em qualquer máquina.
   */
  experimental: {
    cpus: 4,
  },

  /*
   * Desliga o header `x-powered-by` (Next.js): expõe a stack para qualquer
   * um que inspecione a resposta — informação que só ajuda a direcionar
   * ataque, nunca o usuário.
   */
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Fonte única de resposta: aplica a todas as rotas, estáticas e API.
        source: "/:path*",
        headers: [
          // Impede navegador de "adivinhar" o tipo MIME (sniffing).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Não vaza a URL completa (com token/query) para outros domínios.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nada deste domínio pode ser embutido em iframe (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Câmera/microfone não existem no produto; negar evita prompt inútil.
          { key: "Permissions-Policy", value: "camera=(), microphone=()" },
        ],
      },
    ];
  },
  /*
   * CSP ficou de fora de propósito: o payload RSC do Next embute scripts
   * inline que exigem nonce gerado por request, e um CSP errado quebra o app
   * inteiro silenciosamente. Aplicar sem verificação de runtime aqui (sem
   * banco neste ambiente) seria mais risco que proteção — fica registrado
   * como pendente para o hardening com ambiente completo.
   */
};

export default nextConfig;
