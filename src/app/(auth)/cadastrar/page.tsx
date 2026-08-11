import type { Metadata } from "next";

import { RegisterForm } from "@/ui/auth-form";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta para contratar ou oferecer serviços de climatização.",
  robots: { index: false, follow: true },
};

export default async function CadastrarPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;

  return (
    <>
      <p className="eyebrow text-[var(--accent-text)]">Sua conta</p>
      <h1 className="mt-2 text-[1.75rem] leading-tight font-extrabold tracking-[-0.04em]">
        Criar conta
      </h1>
      <p className="text-secondary mt-2 mb-7 text-[0.9375rem]">
        Leva menos de um minuto. Cadastro gratuito.
      </p>
      <RegisterForm papelInicial={tipo === "prestador" ? "PROVIDER" : "CUSTOMER"} />
    </>
  );
}
