import type { Metadata } from "next";

import { guardaDePagina } from "@/server/auth/page-guards";
import { requireAdmin } from "@/server/auth/rbac";
import { Badge } from "@/ui";
import { AdminLogoutButton, AdminSideNav, AdminTopNav } from "@/ui/admin-shell";
import { Logo } from "@/ui/logo";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel AirFlow" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Autorização real no servidor: o layout inteiro exige ADMIN (§5). Esconder
  // o link no menu não é controle de acesso.
  const session = await guardaDePagina(requireAdmin);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="surface-card sticky top-0 z-40 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <Badge tone="danger">Admin</Badge>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-secondary hidden truncate text-sm sm:inline">
              {session.email}
            </span>
            <AdminLogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-8 px-5 py-6">
        {/* hidden no <aside>: um container visível de largura fixa continuaria
            reservando espaço e espremeria o conteúdo no mobile. */}
        <aside className="hidden w-[210px] shrink-0 md:block">
          <AdminSideNav />
        </aside>
        <main id="conteudo" className="anim-fade min-w-0 flex-1">
          <AdminTopNav />
          {children}
        </main>
      </div>
    </div>
  );
}
