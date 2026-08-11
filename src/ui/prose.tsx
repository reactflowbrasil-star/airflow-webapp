import type { ReactNode } from "react";

/**
 * Container de texto longo para páginas institucionais.
 * Largura de leitura confortável e hierarquia tipográfica consistente (§48).
 */
export function Prose({
  eyebrow = "Institucional",
  titulo,
  intro,
  atualizadoEm,
  chips,
  children,
}: {
  eyebrow?: string;
  titulo: string;
  intro?: string;
  atualizadoEm?: string;
  /** Alternador entre páginas irmãs (Como funciona / Segurança). */
  chips?: { href: string; rotulo: string; ativo: boolean }[];
  children: ReactNode;
}) {
  return (
    <main
      id="conteudo"
      className="anim-fade mx-auto w-full max-w-[780px] flex-1 px-5 py-10 sm:py-14"
    >
      <p className="eyebrow text-[var(--accent-text)]">{eyebrow}</p>
      <h1 className="mt-2.5 text-[clamp(30px,4.4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance">
        {titulo}
      </h1>
      {intro && (
        <p className="text-secondary mt-4 text-[1.0625rem] leading-relaxed text-pretty">
          {intro}
        </p>
      )}
      {chips && (
        <div className="mt-6 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <a
              key={chip.href}
              href={chip.href}
              aria-current={chip.ativo ? "page" : undefined}
              className={`rounded-(--radius-pill) border px-4 py-2 text-[0.8125rem] font-medium transition-all duration-250 ${
                chip.ativo
                  ? "bg-grad border-transparent text-white"
                  : "surface-card hover:border-[var(--accent-border)]"
              }`}
            >
              {chip.rotulo}
            </a>
          ))}
        </div>
      )}
      {atualizadoEm && (
        <p className="text-muted num mt-3 text-sm">
          Última atualização: {atualizadoEm}
        </p>
      )}
      <div
        className={[
          "mt-8 flex flex-col gap-5 leading-relaxed",
          "[&_h2]:tracking-[-0.03em]",
          "[&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
          "[&_h3]:mt-3 [&_h3]:font-semibold",
          "[&_p]:text-secondary",
          "[&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5",
          "[&_li]:list-disc [&_li]:text-[var(--text-secondary)]",
          "[&_strong]:text-[var(--text-primary)]",
          "[&_a]:text-[var(--accent-text)] [&_a]:underline",
        ].join(" ")}
      >
        {children}
      </div>
    </main>
  );
}
