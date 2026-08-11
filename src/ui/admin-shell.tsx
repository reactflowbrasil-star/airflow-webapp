"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/ui";

/**
 * Navegação do painel administrativo.
 *
 * Rail no desktop e barra rolável no mobile — são doze seções, mais do que
 * cabe numa barra fixa de cinco itens como a do cliente e a do prestador.
 */

interface ItemNav {
  href: string;
  rotulo: string;
  icone: string;
}

const GRUPOS: ReadonlyArray<{ titulo: string; itens: readonly ItemNav[] }> = [
  {
    titulo: "Operação",
    itens: [
      { href: "/admin", rotulo: "Visão geral", icone: "gauge" },
      { href: "/admin/tecnicos", rotulo: "Aprovar técnicos", icone: "user-check" },
      { href: "/admin/usuarios", rotulo: "Usuários", icone: "users-three" },
      { href: "/admin/pedidos", rotulo: "Pedidos", icone: "receipt" },
      { href: "/admin/disputas", rotulo: "Disputas", icone: "scales" },
      { href: "/admin/avaliacoes", rotulo: "Avaliações", icone: "star" },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { href: "/admin/financeiro", rotulo: "Ledger", icone: "book-open" },
      { href: "/admin/repasses", rotulo: "Repasses", icone: "hand-coins" },
      { href: "/admin/comissoes", rotulo: "Comissões", icone: "percent" },
    ],
  },
  {
    titulo: "Plataforma",
    itens: [
      { href: "/admin/catalogo", rotulo: "Catálogo", icone: "squares-four" },
      { href: "/admin/eventos", rotulo: "Eventos n8n", icone: "broadcast" },
      { href: "/admin/auditoria", rotulo: "Auditoria", icone: "shield-check" },
    ],
  },
];

const TODOS: readonly ItemNav[] = GRUPOS.flatMap((g) => g.itens);

function ativoEm(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminSideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções do painel" className="hidden md:block">
      <div className="flex flex-col gap-5">
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="eyebrow mb-2 px-3.5">{grupo.titulo}</p>
            <ul className="flex flex-col gap-0.5">
              {grupo.itens.map((item) => {
                const ativo = ativoEm(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={ativo ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-[12px] px-3.5 py-2 text-[0.875rem] transition-colors ${
                        ativo
                          ? "accent-soft font-semibold text-[var(--accent-text)]"
                          : "text-secondary hover:bg-[var(--surface-muted)]"
                      }`}
                    >
                      <Icon name={item.icone} className="text-base" />
                      {item.rotulo}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** No mobile a lista vira uma faixa rolável — doze itens não cabem empilhados. */
export function AdminTopNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Seções do painel"
      className="surface-card sticky top-0 z-30 -mx-5 mb-4 overflow-x-auto border-x-0 border-t-0 px-5 py-2.5 md:hidden"
    >
      <ul className="flex w-max gap-1.5">
        {TODOS.map((item) => {
          const ativo = ativoEm(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-(--radius-pill) border px-3 py-1.5 text-[0.8125rem] whitespace-nowrap transition-colors ${
                  ativo
                    ? "accent-soft border-[var(--accent)] font-semibold text-[var(--accent-text)]"
                    : "surface-muted text-secondary border-transparent"
                }`}
              >
                <Icon name={item.icone} />
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminLogoutButton() {
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
