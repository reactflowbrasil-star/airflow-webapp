"use client";

import { useState } from "react";

import { Card } from "@/ui";

/**
 * Accordion do FAQ. Usa <details> nativo por acessibilidade (teclado e
 * leitor de tela funcionam sem JS); o estado local só existe para pintar a
 * borda de acento e girar o "+" quando aberto.
 */
export function Faq({
  itens,
}: {
  itens: readonly { pergunta: string; resposta: string }[];
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3">
      {itens.map((item) => {
        const ativo = aberto === item.pergunta;
        return (
          <Card
            key={item.pergunta}
            className={
              ativo
                ? "border-[var(--accent)] shadow-(--shadow-float) transition-all duration-350"
                : "transition-all duration-350"
            }
          >
            <details
              open={ativo}
              onToggle={(e) =>
                setAberto(e.currentTarget.open ? item.pergunta : null)
              }
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold marker:hidden">
                {item.pergunta}
                <span
                  aria-hidden="true"
                  className={`accent-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-lg text-[var(--accent-text)] transition-transform duration-350 ${
                    ativo ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </summary>
              <p className="text-secondary px-5 pb-5 text-[0.9375rem] leading-relaxed">
                {item.resposta}
              </p>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
