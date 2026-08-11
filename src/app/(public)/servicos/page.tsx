import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { ButtonLink, HoverCard, Icon, IconBox } from "@/ui";

export const metadata: Metadata = {
  title: "Serviços de ar-condicionado",
  description:
    "Limpeza, instalação, manutenção, carga de gás e reparo de ar-condicionado. Veja o preço de referência de cada serviço e receba propostas de técnicos verificados.",
  alternates: { canonical: "/servicos" },
};

/**
 * Catálogo público de serviços (§50).
 *
 * Estática com revalidação: o catálogo muda raramente e esta é uma das páginas
 * de entrada orgânica do produto — servir HTML pronto vale mais aqui do que
 * refletir no mesmo segundo uma categoria recém-criada.
 */
export const revalidate = 3600;

/** Ícone por categoria; `wrench` cobre o que for cadastrado depois (§4). */
const ICONE: Record<string, string> = {
  "limpeza-ar-condicionado": "drop",
  "instalacao-ar-condicionado": "wrench",
  "manutencao-preventiva": "shield-check",
  "manutencao-corretiva": "first-aid-kit",
  "carga-de-gas": "thermometer-simple",
  desinstalacao: "arrows-in",
  reinstalacao: "arrows-out",
  diagnostico: "magnifying-glass",
  "troca-de-componentes": "gear-six",
  "atendimento-emergencial": "siren",
};

export default async function ServicosPage() {
  const categorias = await prisma.serviceCategory.findMany({
    where: { active: true, parentId: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      basePriceCents: true,
    },
  });

  return (
    <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
      <p className="eyebrow text-[var(--accent-text)]">Catálogo</p>
      <h1 className="mt-2.5 max-w-3xl text-[clamp(28px,4.4vw,46px)] leading-[1.03] font-extrabold tracking-[-0.04em]">
        Serviços de climatização com preço combinado antes
      </h1>
      <p className="text-secondary mt-4 max-w-2xl leading-relaxed">
        Os valores abaixo são referências de mercado. O preço real sai da
        negociação com o técnico — você propõe, ele responde, e só há cobrança
        depois que os dois concordam.
      </p>

      <ul className="mt-9 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {categorias.map((categoria) => (
          <li key={categoria.id} className="min-w-0">
            <Link
              href={`/tecnicos?categoria=${categoria.slug}`}
              className="block h-full"
            >
              <HoverCard className="flex h-full flex-col p-6">
                <IconBox name={ICONE[categoria.slug] ?? "wrench"} size={48} />
                <h2 className="mt-4 text-lg font-bold tracking-[-0.02em]">
                  {categoria.name}
                </h2>
                {categoria.description && (
                  <p className="text-secondary mt-2 flex-1 text-sm leading-relaxed">
                    {categoria.description}
                  </p>
                )}
                {categoria.basePriceCents !== null && (
                  <p className="text-muted mt-4 text-xs">
                    referência a partir de{" "}
                    <span className="num text-base font-extrabold text-[var(--accent-text)]">
                      {formatBRL(money(categoria.basePriceCents))}
                    </span>
                  </p>
                )}
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-text)]">
                  Ver técnicos
                  <Icon name="arrow-right" />
                </span>
              </HoverCard>
            </Link>
          </li>
        ))}
      </ul>

      <div className="accent-soft mt-10 flex flex-wrap items-center justify-between gap-4 rounded-(--radius-hero) border p-7">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-[-0.03em]">
            Não achou o que precisa?
          </h2>
          <p className="text-secondary mt-1.5 text-sm leading-relaxed">
            Descreva o problema com suas palavras. A busca entende sintomas como
            &ldquo;não gela&rdquo; ou &ldquo;vazando água&rdquo;.
          </p>
        </div>
        <ButtonLink href="/tecnicos" size="lg">
          Descrever meu problema
        </ButtonLink>
      </div>
    </main>
  );
}
