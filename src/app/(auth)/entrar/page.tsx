import type { Metadata } from "next";

import { LoginForm } from "@/ui/auth-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta AirFlow.",
  robots: { index: false, follow: true },
};

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ redirecionar?: string }>;
}) {
  const { redirecionar } = await searchParams;

  // Só aceita caminho interno — evita open redirect via ?redirecionar=https://…
  const destino =
    redirecionar?.startsWith("/") && !redirecionar.startsWith("//")
      ? redirecionar
      : undefined;

  return (
    <>
      <p className="eyebrow text-[var(--accent-text)]">Sua conta</p>
      <h1 className="mt-2 text-[1.75rem] leading-tight font-extrabold tracking-[-0.04em]">
        Entrar
      </h1>
      <p className="text-secondary mt-2 mb-7 text-[0.9375rem]">
        Acesse para acompanhar seus serviços e pagamentos.
      </p>
      <LoginForm redirecionar={destino} />
    </>
  );
}
