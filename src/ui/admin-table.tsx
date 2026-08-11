import { clsx } from "clsx";
import type { ReactNode } from "react";

import { Card } from "@/ui";

/**
 * Tabela do painel.
 *
 * `<table>` de verdade, não um grid de divs: leitor de tela anuncia linha e
 * coluna, e o usuário navega por células. O invólucro rola no eixo x — tabela
 * de dados é o caso em que rolagem horizontal é a resposta certa, desde que
 * fique contida e não empurre a página inteira.
 */
export function AdminTable({
  colunas,
  children,
  vazio,
}: {
  colunas: readonly string[];
  children: ReactNode;
  /** Mostrado no lugar do corpo quando não há linhas. */
  vazio?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="surface-muted">
              {colunas.map((coluna) => (
                <th
                  key={coluna}
                  scope="col"
                  className="text-muted px-4 py-3 text-left text-[0.6875rem] font-semibold tracking-[0.08em] uppercase whitespace-nowrap"
                >
                  {coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {vazio}
    </Card>
  );
}

export function Linha({ children }: { children: ReactNode }) {
  return (
    <tr className="border-t border-[var(--surface-border)] transition-colors hover:bg-[var(--surface-muted)]">
      {children}
    </tr>
  );
}

export function Celula({
  children,
  numerica,
  className,
}: {
  children: ReactNode;
  /** Alinha à direita e usa tabular-nums — coluna de valor tem de bater. */
  numerica?: boolean;
  className?: string;
}) {
  return (
    <td
      className={clsx(
        "px-4 py-3 align-middle",
        numerica && "num text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Cabeçalho de página do painel, com contagem opcional. */
export function AdminHeader({
  eyebrow,
  titulo,
  descricao,
  acao,
}: {
  eyebrow: string;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow text-[var(--accent-text)]">{eyebrow}</p>
        <h1 className="mt-2 text-[clamp(22px,3vw,30px)] leading-[1.1] font-extrabold tracking-[-0.03em]">
          {titulo}
        </h1>
        {descricao && (
          <p className="text-secondary mt-1.5 max-w-2xl text-sm leading-relaxed">
            {descricao}
          </p>
        )}
      </div>
      {acao}
    </div>
  );
}
