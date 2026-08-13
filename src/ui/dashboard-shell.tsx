"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { clsx } from "clsx";

import { Avatar, Icon } from "@/ui";
import { Logo } from "@/ui/logo";

/**
 * Shell único para as áreas logadas (cliente `/app` e prestador `/pro`).
 *
 * Um só padrão de painel para as duas áreas — antes havia dois shells que
 * espelhavam a mesma estrutura e divergiam em detalhes. Estrutura:
 *
 * - Desktop (`lg+`): sidebar fixa de 264px com perfil no topo, navegação em
 *   grupos acordeon e ações no rodapé; o conteúdo ocupa o resto da tela.
 * - Mobile/tablet: header sticky com botão hambúrguer que abre um drawer
 *   deslizante com overlay (a barra inferior fixa sumiu de propósito — com
 *   mais de cinco destinos, o drawer com grupos é mais escalável e não
 *   compete com o conteúdo).
 *
 * Acordeon usa `<details>` nativo: o estado de abertura vive no navegador,
 * sem `useState` (o lint deste repositório recusa setState dentro de efeito,
 * e o grupo do item ativo precisa reabrir sozinho após navegação — reaplicar
 * `open={contemAtivo}` no render resolve isso sem efeito nenhum). O drawer,
 * sim, é estado de componente: fechar é sempre evento (clique no link, no
 * overlay, na tecla Esc).
 */

export interface ItemNav {
  href: string;
  rotulo: string;
  /** Nome do ícone Phosphor (duotone), sem prefixo. */
  icone: string;
}

export interface GrupoNav {
  rotulo: string;
  itens: readonly ItemNav[];
}

function itemAtivo(pathname: string, href: string): boolean {
  // A raiz da área é destaque exato; as demais rotas destacam também os
  // filhos dinâmicos (`/app/solicitacoes` cobre `/app/solicitacoes/[id]`).
  return href === "/app" || href === "/pro"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function grupoContemAtivo(pathname: string, grupo: GrupoNav): boolean {
  return grupo.itens.some((item) => itemAtivo(pathname, item.href));
}

/* -------------------------------------------------------------------------- */
/* Acordeon de navegação (sidebar desktop e drawer mobile)                     */
/* -------------------------------------------------------------------------- */

function AcordeonNav({ grupos }: { grupos: readonly GrupoNav[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções" className="flex flex-col gap-1">
      {grupos.map((grupo) => (
        <details
          key={grupo.rotulo}
          open={grupoContemAtivo(pathname, grupo)}
          className="group"
        >
          <summary className="text-muted flex cursor-pointer list-none items-center justify-between rounded-[12px] px-3 py-2 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase select-none [&::-webkit-details-marker]:hidden hover:text-[var(--accent-text)]">
            {grupo.rotulo}
            <Icon
              name="caret-down"
              className="transition-transform duration-250 group-open:rotate-180"
            />
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {grupo.itens.map((item) => {
              const ativo = itemAtivo(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    className={clsx(
                      "flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-sm transition-colors",
                      ativo
                        ? "accent-soft font-semibold text-[var(--accent-text)]"
                        : "text-secondary hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <Icon
                      name={item.icone}
                      className={clsx("shrink-0 text-lg", ativo ? "" : "opacity-70")}
                    />
                    <span className="min-w-0 truncate">{item.rotulo}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Perfil compacto (avatar + identidade + badge de status)                     */
/* -------------------------------------------------------------------------- */

function PerfilDoPainel({
  nome,
  badge,
}: {
  nome: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3">
      <Avatar name={nome} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.875rem] font-semibold">{nome}</p>
        {badge && <div className="mt-1">{badge}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

export function DashboardShell({
  nome,
  badge,
  grupos,
  rodape,
  children,
}: {
  /** Identidade exibida no perfil (nome do usuário / nome do prestador). */
  nome: string;
  /** Badge de status opcional (ex.: "Recebendo solicitações"). */
  badge?: ReactNode;
  grupos: readonly GrupoNav[];
  /** Ações do rodapé da navegação (ex.: sair). */
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const [menuAberto, setMenuAberto] = useState(false);

  // Esc fecha o drawer. O listener é registrado só com o drawer aberto, e o
  // `setState` acontece no handler do evento — não no corpo do efeito (regra
  // do repositório: disparar pelo evento que causou a mudança).
  useEffect(() => {
    if (!menuAberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setMenuAberto(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [menuAberto]);

  const conteudoNav = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pt-5 pb-4">
        <Logo />
      </div>
      <div className="px-2 pb-4">
        <PerfilDoPainel nome={nome} badge={badge} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <AcordeonNav grupos={grupos} />
      </div>
      {rodape && (
        <div
          className="border-t border-[var(--surface-border)] px-5 py-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {rodape}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      {/* ================= Header mobile: hambúrguer + marca ================= */}
      <header className="surface-card sticky top-0 z-40 border-x-0 border-t-0 lg:hidden">
        <div
          className="flex items-center justify-between gap-3 px-4"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
        >
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
              aria-expanded={menuAberto}
              aria-controls="menu-painel"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              <Icon name="list" className="text-xl" />
            </button>
            <Logo />
          </div>
          {badge && <div className="min-w-0">{badge}</div>}
        </div>
      </header>

      {/* =============== Drawer mobile: navegação deslizante ================= */}
      <div
        aria-hidden={!menuAberto}
        className={clsx(
          "fixed inset-0 z-50 transition-[visibility] duration-300 lg:hidden",
          menuAberto ? "visible" : "pointer-events-none invisible",
        )}
      >
        <div
          onClick={() => setMenuAberto(false)}
          className={clsx(
            "absolute inset-0 bg-[rgba(16,12,33,0.45)] transition-opacity duration-300",
            menuAberto ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          id="menu-painel"
          role="dialog"
          aria-modal="true"
          aria-label="Menu do painel"
          className={clsx(
            "surface-card absolute inset-y-0 left-0 w-[288px] max-w-[85vw] shadow-(--shadow-float)",
            "transition-transform duration-300",
            menuAberto ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {conteudoNav}
        </div>
      </div>

      {/* ================= Sidebar desktop fixa (lg+) ================= */}
      <aside className="surface-card fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-x-0 border-t-0 border-r lg:flex">
        {conteudoNav}
      </aside>

      {/* ========================= Conteúdo ========================= */}
      <main id="conteudo" className="anim-fade w-full px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
