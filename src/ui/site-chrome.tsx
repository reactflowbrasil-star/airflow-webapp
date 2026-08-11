import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="surface-card mt-auto border-x-0 border-b-0 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted text-sm">
          © {new Date().getFullYear()} AirFlow — marketplace de climatização.
        </p>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-5 text-sm">
          {[
            ["/como-funciona", "Como funciona"],
            ["/seguranca", "Segurança"],
            ["/termos", "Termos"],
            ["/privacidade", "Privacidade"],
          ].map(([href, rotulo]) => (
            <Link
              key={href}
              href={href}
              className="text-secondary transition-colors hover:text-[var(--accent-text)]"
            >
              {rotulo}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
