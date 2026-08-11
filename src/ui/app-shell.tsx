"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Navegação inferior (§47).
 *
 * Mobile-first: no smartphone é a navegação principal, fixa no rodapé com
 * área de toque adequada (§62). A partir de `md` some e dá lugar ao menu
 * lateral, para não desperdiçar altura em telas grandes.
 */

interface ItemNav {
  href: string;
  rotulo: string;
  icone: ReactNode;
}

function Icone({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const ITENS_CLIENTE: ItemNav[] = [
  { href: "/app", rotulo: "Início", icone: <Icone path="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" /> },
  {
    href: "/tecnicos",
    rotulo: "Buscar",
    icone: <Icone path="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35" />,
  },
  {
    href: "/app/solicitacoes",
    rotulo: "Serviços",
    icone: <Icone path="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    href: "/app/mensagens",
    rotulo: "Mensagens",
    icone: <Icone path="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.6-.7L3 21l1.9-5A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 8.5-8.4A8.4 8.4 0 0 1 21 11.5Z" />,
  },
  {
    href: "/app/perfil",
    rotulo: "Perfil",
    icone: <Icone path="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="surface-card fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {ITENS_CLIENTE.map((item) => {
          const ativo =
            item.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[0.6875rem] transition-colors ${
                  ativo ? "text-brand-600 dark:text-brand-300" : "text-muted"
                }`}
              >
                {item.icone}
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções" className="hidden md:block">
      <ul className="flex flex-col gap-1">
        {ITENS_CLIENTE.map((item) => {
          const ativo =
            item.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-(--radius-field) px-3 py-2 text-sm transition-colors ${
                  ativo
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200 font-medium"
                    : "text-secondary hover:bg-[var(--surface-muted)]"
                }`}
              >
                {item.icone}
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function LogoutButton() {
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/sair", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      className="text-secondary hover:text-danger-700 text-sm transition-colors"
    >
      Sair
    </button>
  );
}
