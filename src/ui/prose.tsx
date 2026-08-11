import type { ReactNode } from "react";

/**
 * Container de texto longo para páginas institucionais.
 * Largura de leitura confortável e hierarquia tipográfica consistente (§48).
 */
export function Prose({
  titulo,
  atualizadoEm,
  children,
}: {
  titulo: string;
  atualizadoEm?: string;
  children: ReactNode;
}) {
  return (
    <main id="conteudo" className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {titulo}
      </h1>
      {atualizadoEm && (
        <p className="text-muted mt-2 text-sm">Última atualização: {atualizadoEm}</p>
      )}
      <div
        className={[
          "mt-8 flex flex-col gap-5 leading-relaxed",
          "[&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
          "[&_h3]:mt-3 [&_h3]:font-semibold",
          "[&_p]:text-secondary",
          "[&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5",
          "[&_li]:list-disc [&_li]:text-[var(--text-secondary)]",
          "[&_strong]:text-[var(--text-primary)]",
          "[&_a]:text-brand-600 [&_a]:underline",
        ].join(" ")}
      >
        {children}
      </div>
    </main>
  );
}
