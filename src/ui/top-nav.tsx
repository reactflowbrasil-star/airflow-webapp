"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { ButtonLink, Icon } from "@/ui";
import { Logo } from "@/ui/logo";

/**
 * Barra flutuante de vidro do topo.
 *
 * Segue o Top-Nav do Framer que o cliente indicou: pílula centrada sobre o
 * conteúdo, `backdrop-filter: blur(10px)`, borda de 1px e raio de 100px que
 * cai para 30px quando o menu mobile abre. O módulo original não pôde ser
 * importado — depende do runtime `framer` e busca outros quatro módulos em
 * framerusercontent.com em tempo de execução, o que quebraria o PWA offline e
 * traria um terceiro para dentro do carregamento de toda página. O desenho foi
 * reimplementado sobre os tokens do projeto, então funciona nos dois temas.
 *
 * Componente de cliente por causa do menu, mas sem leitura de sessão: o HTML
 * continua sendo gerado no servidor e as páginas públicas seguem estáticas
 * (§50, §61).
 */

const LINKS = [
  { href: "/tecnicos", rotulo: "Encontrar técnico" },
  { href: "/servicos", rotulo: "Serviços" },
  { href: "/como-funciona", rotulo: "Como funciona" },
  { href: "/seja-prestador", rotulo: "Seja prestador" },
] as const;

export function TopNav() {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const painelId = useId();

  // Esc fecha — é o que se espera de qualquer disclosure sobreposta (§62).
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <header className="sticky top-0 z-40 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        className={clsx(
          "surface-card w-full shadow-(--shadow-raised)",
          // O handoff da landing (Figma “Desktop / 1440”) traz o header como
          // barra branca de raio 26 — não mais a pílula de vidro. O painel
          // mobile mantém o mesmo raio para não cortar os links.
          "transition-[border-radius] duration-350 rounded-[26px]",
        )}
      >
        <div className="flex items-center justify-between gap-4 py-2.5 pr-2.5 pl-5">
          <Logo />

          <nav
            aria-label="Principal"
            className="hidden items-center gap-7 text-[0.9375rem] font-medium md:flex"
          >
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={clsx(
                  "transition-colors",
                  pathname === link.href
                    ? "font-semibold text-[var(--accent-text)]"
                    : "text-secondary hover:text-[var(--accent-text)]",
                )}
              >
                {link.rotulo}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ButtonLink href="/entrar" variant="ghost" size="sm">
              Entrar
            </ButtonLink>
            <ButtonLink href="/cadastrar" size="sm" className="max-sm:hidden">
              Criar conta <span aria-hidden="true">→</span>
            </ButtonLink>

            <button
              type="button"
              onClick={() => setAberto((estava) => !estava)}
              aria-expanded={aberto}
              aria-controls={painelId}
              aria-label={aberto ? "Fechar menu" : "Abrir menu"}
              className={clsx(
                "text-secondary grid h-10 w-10 shrink-0 place-items-center rounded-full",
                "text-xl transition-colors hover:text-[var(--accent-text)] md:hidden",
              )}
            >
              <Icon name={aberto ? "x" : "list"} />
            </button>
          </div>
        </div>

        {aberto && (
          <div
            id={painelId}
            className="anim-expand border-t border-[var(--glass-border)] px-4 pt-3 pb-4 md:hidden"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <nav aria-label="Principal (mobile)">
              <ul className="flex flex-col gap-1">
                {LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      // Fechar no clique, e não sincronizando com o pathname:
                      // o App Router não desmonta o layout entre rotas, então
                      // sem isto o painel ficaria aberto sobre a página nova.
                      onClick={() => setAberto(false)}
                      aria-current={pathname === link.href ? "page" : undefined}
                      className={clsx(
                        "block rounded-[14px] px-3.5 py-2.5 text-[0.9375rem] transition-colors",
                        pathname === link.href
                          ? "accent-soft font-semibold text-[var(--accent-text)]"
                          : "text-secondary hover:bg-[var(--surface-muted)]",
                      )}
                    >
                      {link.rotulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <ButtonLink
              href="/cadastrar"
              fullWidth
              onClick={() => setAberto(false)}
              className="mt-3 sm:hidden"
            >
              Criar conta
            </ButtonLink>
          </div>
        )}
      </div>
    </header>
  );
}
