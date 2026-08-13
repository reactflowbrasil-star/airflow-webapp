import type { Metadata } from "next";

import { requireProvider } from "@/server/auth/rbac";
import { guardaDePagina } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Badge, LiveDot } from "@/ui";
import {
  ProviderBottomNav,
  ProviderLogoutButton,
  ProviderSideNav,
} from "@/ui/provider-shell";
import { Logo } from "@/ui/logo";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PrestadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Autorização real: o layout inteiro exige papel PROVIDER no servidor (§5).
  const session = await guardaDePagina(requireProvider);
  const perfil = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: session.providerProfileId },
    select: { displayName: true, status: true },
  });

  const recebendo = perfil.status === "APROVADO";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="surface-card sticky top-0 z-30 border-x-0 border-t-0">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <Logo />
          <div className="flex items-center gap-4">
            <Badge tone={recebendo ? "success" : "warning"}>
              <LiveDot />
              {recebendo ? "Recebendo solicitações" : "Cadastro em análise"}
            </Badge>
            <span className="text-secondary hidden text-sm sm:inline">
              {perfil.displayName}
            </span>
            <ProviderLogoutButton />
          </div>
        </div>
      </header>

      <div className="flex w-full flex-1 gap-8 px-5 py-6">
        {/* hidden precisa estar no aside: um container visível de largura fixa
            continuaria reservando espaço e espremeria o conteúdo no mobile. */}
        <aside className="hidden w-[212px] shrink-0 md:block">
          <ProviderSideNav />
        </aside>
        <main id="conteudo" className="anim-fade min-w-0 flex-1 pb-24 md:pb-0">
          {children}
        </main>
      </div>

      <ProviderBottomNav />
    </div>
  );
}
