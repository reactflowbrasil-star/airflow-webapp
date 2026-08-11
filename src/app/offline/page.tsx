import type { Metadata } from "next";

import { ButtonLink, EmptyState } from "@/ui";

export const metadata: Metadata = {
  title: "Sem conexão",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-5">
      <EmptyState
        title="Você está sem conexão"
        description="Não foi possível carregar esta página. Verifique sua internet e tente novamente — suas solicitações em andamento continuam salvas."
        action={<ButtonLink href="/">Voltar ao início</ButtonLink>}
      />
    </main>
  );
}
