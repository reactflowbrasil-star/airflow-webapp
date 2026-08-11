import Link from "next/link";

/**
 * Marca do produto. Módulo próprio porque tanto o cabeçalho público quanto os
 * layouts de cliente e prestador a usam — deixá-la junto de um deles criaria
 * ciclo de import entre os dois.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2.5 text-[1.0625rem] font-extrabold tracking-[-0.03em] ${className ?? ""}`}
    >
      <span className="bg-grad inline-flex h-9 w-9 items-center justify-center rounded-[12px] text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M3 7h13a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3V7zm0 5h16a3 3 0 1 1-3 3h2a1 1 0 1 0-1-1H3v-2zm0 5h9a2.5 2.5 0 1 1-2.5 2.5h2A.5.5 0 1 0 12 19H3v-2z" />
        </svg>
      </span>
      AirFlow
    </Link>
  );
}
