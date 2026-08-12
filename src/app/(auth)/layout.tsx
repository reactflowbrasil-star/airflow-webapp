import Link from "next/link";

/** Data impura fora do corpo do componente — regra de pureza do repo. */
function anoAtual(): number {
  return new Date().getFullYear();
}

/**
 * Card único dividido: painel de marca + formulário (handoff).
 * Em telas estreitas o painel de marca some — ele é reforço, não conteúdo,
 * e ocuparia a altura que o formulário precisa no celular.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-8">
      <div className="surface-card anim-fade flex w-full max-w-[860px] overflow-hidden rounded-(--radius-hero) shadow-(--shadow-float)">
        {/* Painel de marca */}
        <aside className="bg-grad relative hidden flex-[1_1_380px] flex-col justify-between overflow-hidden p-10 text-white lg:flex">
          <div
            aria-hidden="true"
            className="anim-drift absolute -top-20 -right-16 h-72 w-72 rounded-full bg-white/15 blur-2xl"
          />

          <Link href="/" className="relative flex items-center gap-2.5 text-lg font-extrabold">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden="true">
                <path d="M3 7h13a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3V7zm0 5h16a3 3 0 1 1-3 3h2a1 1 0 1 0-1-1H3v-2zm0 5h9a2.5 2.5 0 1 1-2.5 2.5h2A.5.5 0 1 0 12 19H3v-2z" />
              </svg>
            </span>
            AirFlow
          </Link>

          <div className="relative">
            <p className="text-[2rem] leading-[1.1] font-extrabold tracking-[-0.04em] text-balance">
              Seu ar-condicionado nas mãos de quem entende.
            </p>
            <p className="mt-4 leading-relaxed text-white/85 text-pretty">
              Negocie o valor antes de contratar e pague com segurança: o dinheiro só é
              liberado ao técnico depois do serviço concluído.
            </p>
          </div>

          <p className="relative text-xs text-white/60">
            © {anoAtual()} AirFlow
          </p>
        </aside>

        {/* Formulário */}
        <main className="flex flex-[1_1_380px] items-center justify-center p-7 sm:p-10">
          <div className="w-full max-w-sm min-w-0">
            <Link
              href="/"
              className="mb-7 flex items-center gap-2.5 font-extrabold tracking-[-0.03em] lg:hidden"
            >
              <span className="bg-grad inline-flex h-9 w-9 items-center justify-center rounded-[12px] text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                  <path d="M3 7h13a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3V7zm0 5h16a3 3 0 1 1-3 3h2a1 1 0 1 0-1-1H3v-2zm0 5h9a2.5 2.5 0 1 1-2.5 2.5h2A.5.5 0 1 0 12 19H3v-2z" />
                </svg>
              </span>
              AirFlow
            </Link>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
