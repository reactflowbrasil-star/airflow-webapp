import type { Metadata } from "next";

import { PasswordResetForm } from "@/ui/password-reset-form";

export const metadata: Metadata = {
  title: "Recuperar senha",
  description: "Recupere o acesso à sua conta AirFlow com um código por WhatsApp.",
  robots: { index: false, follow: true },
};

export default function RecuperarSenhaPage() {
  return (
    <>
      <p className="eyebrow text-[var(--accent-text)]">Sua conta</p>
      <h1 className="mt-2 text-[1.75rem] leading-tight font-extrabold tracking-[-0.04em]">
        Recuperar senha
      </h1>
      <p className="text-secondary mt-2 mb-7 text-[0.9375rem]">
        Enviamos um código por WhatsApp para o número da sua conta. Com ele você
        define uma nova senha.
      </p>
      <PasswordResetForm />
    </>
  );
}
