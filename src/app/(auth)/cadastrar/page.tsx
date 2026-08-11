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
      <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
      <p className="text-secondary mt-1.5 mb-7 text-sm">
        Leva menos de um minuto. Cadastro gratuito.
      </p>
      <RegisterForm papelInicial={tipo === "prestador" ? "PROVIDER" : "CUSTOMER"} />
    </>
  );
}
