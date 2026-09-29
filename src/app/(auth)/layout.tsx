import { Logo } from "@/ui/logo";

/** Data impura fora do corpo do componente — regra de pureza do repo. */
function anoAtual(): number {
  return new Date().getFullYear();
}

/**
 * Card único dividido: painel de marca + formulário (handoff).
 * Em telas estreitas o painel de marca some — ele é reforço, não conteúdo,
 * e ocuparia a altura que o formulário precisa no celular.
 *
 * O painel é preto com o logo claro da Empurrão Digital: texto branco sobre
 * o laranja da marca ficaria em 3,1:1, abaixo do AA; sobre o preto, 19,8:1.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-8">
      <div className="surface-card anim-fade flex w-full max-w-[860px] overflow-hidden rounded-(--radius-hero) shadow-(--shadow-float)">
        {/* Painel de marca */}
        <aside className="relative hidden flex-[1_1_380px] flex-col justify-between overflow-hidden bg-[#0A0A0A] p-10 text-white lg:flex">
          <div
            aria-hidden="true"
            className="anim-drift absolute -top-20 -right-16 h-72 w-72 rounded-full bg-[var(--accent)]/30 blur-3xl"
          />

          <Logo fundo="escuro" className="relative" />

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
            <Logo className="mb-7 lg:hidden" />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
