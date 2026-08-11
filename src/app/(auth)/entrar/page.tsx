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
      <h1 className="text-2xl font-bold tracking-tight">Entrar</h1>
      <p className="text-secondary mt-1.5 mb-7 text-sm">
        Acesse para acompanhar seus serviços e pagamentos.
      </p>
      <LoginForm redirecionar={destino} />
    </>
  );
}
