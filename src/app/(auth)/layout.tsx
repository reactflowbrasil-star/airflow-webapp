import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Coluna de marca — some no mobile para não empurrar o formulário */}
      <aside className="from-brand-950 to-brand-800 relative hidden overflow-hidden bg-gradient-to-br p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="bg-ice-400/20 absolute -top-24 -right-24 h-96 w-96 rounded-full blur-3xl"
        />
        <Link href="/" className="relative flex items-center gap-2 text-xl font-bold">
          <span className="from-brand-500 to-ice-500 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden="true">
              <path d="M3 7h13a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3V7zm0 5h16a3 3 0 1 1-3 3h2a1 1 0 1 0-1-1H3v-2zm0 5h9a2.5 2.5 0 1 1-2.5 2.5h2A.5.5 0 1 0 12 19H3v-2z" />
            </svg>
          </span>
          AirFlow
        </Link>

        <div className="relative">
          <p className="text-3xl leading-tight font-bold text-balance">
            Seu ar-condicionado nas mãos de quem entende.
          </p>
          <p className="text-brand-100 mt-4 leading-relaxed text-pretty">
            Negocie o valor antes de contratar e pague com segurança: o dinheiro só
            é liberado ao técnico depois do serviço concluído.
          </p>
        </div>

        <p className="text-brand-300 relative text-sm">
          © {new Date().getFullYear()} AirFlow
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 flex items-center gap-2 font-bold lg:hidden"
          >
            <span className="from-brand-600 to-ice-500 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white">
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
  );
}
