import type { Metadata } from "next";

import { requireCustomer } from "@/server/auth/rbac";
import { guardaDePagina } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { BottomNav, LogoutButton, SideNav } from "@/ui/app-shell";
import { Logo } from "@/ui/logo";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O proxy já redirecionou quem não tem sessão, mas a autorização de verdade
  // é esta: o layout inteiro exige papel CUSTOMER verificado no servidor (§5).
  const session = await guardaDePagina(requireCustomer);
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { name: true },
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="surface-card sticky top-0 z-30 border-x-0 border-t-0">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="text-secondary hidden text-sm sm:inline">
              {usuario.name}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="flex w-full flex-1 gap-8 px-5 py-6">
        {/* `hidden` precisa estar no aside, não só no SideNav: um container
            visível de largura fixa continua reservando 208px no mobile e
            espremia o conteúdo em ~110px numa tela de 390px. */}
        <aside className="hidden w-[212px] shrink-0 md:block">
          <SideNav />
        </aside>
        {/* pb extra no mobile para o conteúdo não ficar sob a barra inferior */}
        <main id="conteudo" className="anim-fade min-w-0 flex-1 pb-24 md:pb-0">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
