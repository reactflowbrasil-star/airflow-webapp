"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/ui";

/**
 * Navegação da área do prestador. Espelha a estrutura da área do cliente
 * (rail no desktop, barra inferior no mobile) para não haver dois padrões
 * de navegação no mesmo produto.
 */

/**
 * `curto` é o rótulo da barra inferior: com seis itens em 390px sobram ~65px
 * por célula, e "Solicitações" transborda. O rail do desktop usa o nome
 * completo, onde há espaço.
 */
const ITENS = [
  { href: "/pro", rotulo: "Visão geral", curto: "Geral", icone: "trend-up" },
  {
    href: "/pro/solicitacoes",
    rotulo: "Solicitações",
    curto: "Pedidos",
    icone: "tray-arrow-down",
  },
  { href: "/pro/mensagens", rotulo: "Mensagens", curto: "Chat", icone: "chats-circle" },
  { href: "/pro/agenda", rotulo: "Agenda", curto: "Agenda", icone: "calendar-dots" },
  {
    href: "/pro/financeiro",
    rotulo: "Financeiro",
    curto: "Caixa",
    icone: "receipt",
  },
  { href: "/pro/perfil", rotulo: "Perfil", curto: "Perfil", icone: "user-circle" },
] as const;

function ativoEm(pathname: string, href: string): boolean {
  return href === "/pro" ? pathname === "/pro" : pathname.startsWith(href);
}

export function ProviderSideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções" className="hidden md:block">
      <ul className="flex flex-col gap-1">
        {ITENS.map((item) => {
          const ativo = ativoEm(pathname, item.href);
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

export function ProviderBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="surface-card fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {ITENS.map((item) => {
          const ativo = ativoEm(pathname, item.href);
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
                {item.curto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ProviderLogoutButton() {
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
