import type { Metadata } from "next";

import { googleOauthConfigurado } from "@/server/auth/oauth-google";
import { LoginForm } from "@/ui/auth-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta AirFlow.",
  robots: { index: false, follow: true },
};

/** Erros do callback OAuth (?erro=…) viram mensagens que não são oráculo. */
const MENSAGEM_ERRO_OAUTH: Record<string, string> = {
  "google-negado": "Acesso ao Google cancelado.",
  "google-invalido": "Sessão do Google expirada ou inválida. Tente novamente.",
  "google-falhou": "Não foi possível entrar com o Google. Tente novamente.",
  "google-indisponivel": "Conta indisponível. Fale com o suporte.",
  "google-rate": "Muitas tentativas. Aguarde alguns minutos.",
};

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ redirecionar?: string; erro?: string }>;
}) {
  const { redirecionar, erro } = await searchParams;

  // Só aceita caminho interno — evita open redirect via ?redirecionar=https://…
  const destino =
    redirecionar?.startsWith("/") && !redirecionar.startsWith("//")
      ? redirecionar
      : undefined;

  const erroOauth = erro ? MENSAGEM_ERRO_OAUTH[erro] : undefined;

  return (
    <>
      <p className="eyebrow text-[var(--accent-text)]">Sua conta</p>
      <h1 className="mt-2 text-[1.75rem] leading-tight font-extrabold tracking-[-0.04em]">
        Entrar
      </h1>
      <p className="text-secondary mt-2 mb-7 text-[0.9375rem]">
        Acesse para acompanhar seus serviços e pagamentos.
      </p>
      <LoginForm
        redirecionar={destino}
        googleHabilitado={googleOauthConfigurado()}
        erroOauth={erroOauth}
      />
    </>
  );
}
