"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Icon } from "@/ui";

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
  /** Nome do ícone Phosphor (duotone). */
  icone: string;
}

const ITENS_CLIENTE: ItemNav[] = [
  { href: "/app", rotulo: "Início", icone: "trend-up" },
  { href: "/tecnicos", rotulo: "Buscar", icone: "map-pin" },
  { href: "/app/solicitacoes", rotulo: "Serviços", icone: "note-pencil" },
  { href: "/app/mensagens", rotulo: "Mensagens", icone: "chats-circle" },
  { href: "/app/perfil", rotulo: "Perfil", icone: "user-circle" },
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
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[0.625rem] transition-colors ${
                  ativo ? "font-semibold text-[var(--accent-text)]" : "text-muted"
                }`}
              >
                <Icon name={item.icone} className="text-xl" />
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
                className={`flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-sm transition-colors ${
                  ativo
                    ? "accent-soft font-semibold text-[var(--accent-text)]"
                    : "text-secondary hover:bg-[var(--surface-muted)]"
                }`}
              >
                <Icon name={item.icone} className="text-lg" />
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
