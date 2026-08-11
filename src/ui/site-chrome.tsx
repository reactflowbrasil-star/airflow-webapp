import Link from "next/link";

import { ButtonLink } from "@/ui";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-bold tracking-tight ${className ?? ""}`}>
      <span className="from-brand-600 to-ice-500 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M3 7h13a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3V7zm0 5h16a3 3 0 1 1-3 3h2a1 1 0 1 0-1-1H3v-2zm0 5h9a2.5 2.5 0 1 1-2.5 2.5h2A.5.5 0 1 0 12 19H3v-2z" />
        </svg>
      </span>
      AirFlow
    </Link>
  );
}

/**
 * Cabeçalho das páginas públicas.
 *
 * Deliberadamente NÃO lê a sessão: `cookies()` tornaria dinâmica toda página
 * que o usa — inclusive a homepage e os perfis de técnico, que são as peças
 * de SEO do produto (§50) e precisam continuar estáticas (§61).
 *
 * Quem já está autenticado e clica em "Entrar" é levado direto à sua área
 * pelo middleware, então a perda de conveniência é mínima.
 */
export function SiteHeader() {
  return (
    <header className="surface-card sticky top-0 z-40 border-x-0 border-t-0 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Logo />

        <nav aria-label="Principal" className="hidden items-center gap-6 text-sm md:flex">
          <Link href="/tecnicos" className="hover:text-brand-600 transition-colors">
            Encontrar técnico
          </Link>
          <Link href="/servicos" className="hover:text-brand-600 transition-colors">
            Serviços
          </Link>
          <Link href="/como-funciona" className="hover:text-brand-600 transition-colors">
            Como funciona
          </Link>
          <Link href="/seja-prestador" className="hover:text-brand-600 transition-colors">
            Seja prestador
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/entrar" variant="ghost" size="sm">
            Entrar
          </ButtonLink>
          <ButtonLink href="/cadastrar" size="sm" className="max-sm:hidden">
            Criar conta
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-ink-950 text-ink-300 mt-auto py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          © {new Date().getFullYear()} AirFlow — marketplace de climatização.
        </p>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-4 text-sm">
          <Link href="/como-funciona" className="hover:text-white transition-colors">
            Como funciona
          </Link>
          <Link href="/seguranca" className="hover:text-white transition-colors">
            Segurança
          </Link>
          <Link href="/termos" className="hover:text-white transition-colors">
            Termos
          </Link>
          <Link href="/privacidade" className="hover:text-white transition-colors">
            Privacidade
          </Link>
        </nav>
      </div>
    </footer>
  );
}
