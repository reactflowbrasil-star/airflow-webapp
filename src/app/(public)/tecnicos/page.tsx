import Link from "next/link";
import type { Metadata } from "next";

import { searchProvidersSchema } from "@/lib/validation/marketplace";
import { prisma } from "@/server/db/prisma";
import { buscarPrestadores } from "@/server/services/search-service";
import { ButtonLink, Card, EmptyState } from "@/ui";
import { ProviderSearchResults } from "@/ui/provider-search-results";

export const metadata: Metadata = {
  title: "Encontrar técnico de ar-condicionado",
  description:
    "Compare técnicos de climatização por avaliação, distância e preço. Peça orçamento e negocie o valor antes de contratar.",
  alternates: { canonical: "/tecnicos" },
};

const ORDENACOES = [
  ["recomendados", "Recomendados"],
  ["avaliacao", "Melhor avaliados"],
  ["proximos", "Mais próximos"],
  ["preco", "Menor preço"],
  ["experiencia", "Maior experiência"],
  ["resposta", "Resposta mais rápida"],
] as const;

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filtros = searchProvidersSchema.parse(raw);

  const [resultado, categorias, cidades] = await Promise.all([
    buscarPrestadores(filtros),
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
      select: { slug: true, name: true },
    }),
    prisma.city.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { slug: true, name: true, state: true },
    }),
  ]);

  /** Preserva os filtros atuais ao trocar um parâmetro. */
  function linkCom(mudanca: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    for (const [chave, valor] of Object.entries(raw)) {
      if (typeof valor === "string" && valor !== "") params.set(chave, valor);
    }
    for (const [chave, valor] of Object.entries(mudanca)) {
      if (valor === undefined || valor === "") params.delete(chave);
      else params.set(chave, valor);
    }
    params.delete("pagina");
    const query = params.toString();
    return query ? `/tecnicos?${query}` : "/tecnicos";
  }

  return (
    <main id="conteudo" className="anim-fade mx-auto w-full max-w-6xl flex-1 px-5 py-9">
      <p className="eyebrow text-[var(--accent-text)]">Busca</p>
      <h1 className="mt-2.5 text-[clamp(30px,4.4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance">
        Técnicos de ar-condicionado
      </h1>

      <search className="mt-6 block">
        <form action="/tecnicos" method="get" role="search" className="max-w-[560px]">
          {filtros.cidade && <input type="hidden" name="cidade" value={filtros.cidade} />}
          <div className="surface-card flex gap-2 rounded-[18px] p-2 shadow-(--shadow-subtle)">
            <label htmlFor="q" className="sr-only">
              O que você precisa?
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={filtros.q ?? ""}
              placeholder="Ex.: limpeza de split ou “meu ar não está gelando”"
              className="h-11 min-w-0 flex-1 rounded-(--radius-pill) bg-transparent px-4 outline-none placeholder:text-[var(--text-muted)]"
            />
            <button
              type="submit"
              className="bg-grad h-11 shrink-0 rounded-(--radius-pill) px-6 font-semibold text-white transition-transform duration-250 hover:-translate-y-0.5"
            >
              Buscar
            </button>
          </div>
        </form>
      </search>

      {resultado.categoriaInferida && (
        <p className="text-secondary mt-3.5 text-sm">
          Entendemos que você precisa de{" "}
          <Link
            href={linkCom({ categoria: resultado.categoriaInferida.slug, q: undefined })}
            className="font-semibold text-[var(--accent-text)] hover:underline"
          >
            {resultado.categoriaInferida.name}
          </Link>
          . Não é isso?{" "}
          <Link href="/tecnicos" className="hover:underline">
            Ver todos os serviços
          </Link>
          .
        </p>
      )}

      {/* Filtros */}
      <div className="mt-6 flex flex-col gap-3">
        <FiltroLinha titulo="Serviço">
          <ChipLink href={linkCom({ categoria: undefined })} ativo={!filtros.categoria}>
            Todos
          </ChipLink>
          {categorias.map((c) => (
            <ChipLink
              key={c.slug}
              href={linkCom({ categoria: c.slug, q: undefined })}
              ativo={filtros.categoria === c.slug}
            >
              {c.name}
            </ChipLink>
          ))}
        </FiltroLinha>

        <FiltroLinha titulo="Cidade">
          <ChipLink href={linkCom({ cidade: undefined })} ativo={!filtros.cidade}>
            Todas
          </ChipLink>
          {cidades.map((c) => (
            <ChipLink
              key={c.slug}
              href={linkCom({ cidade: c.slug })}
              ativo={filtros.cidade === c.slug}
            >
              {c.name}/{c.state}
            </ChipLink>
          ))}
        </FiltroLinha>

        <FiltroLinha titulo="Filtros">
          <ChipLink
            href={linkCom({ verificados: filtros.verificados ? undefined : "true" })}
            ativo={Boolean(filtros.verificados)}
          >
            Somente verificados
          </ChipLink>
          <ChipLink
            href={linkCom({ emergencia: filtros.emergencia ? undefined : "true" })}
            ativo={Boolean(filtros.emergencia)}
          >
            Atende emergência
          </ChipLink>
          <ChipLink
            href={linkCom({ comercial: filtros.comercial ? undefined : "true" })}
            ativo={Boolean(filtros.comercial)}
          >
            Atende comercial
          </ChipLink>
          <ChipLink
            href={linkCom({ notaMin: filtros.notaMin ? undefined : "4" })}
            ativo={Boolean(filtros.notaMin)}
          >
            Nota 4+
          </ChipLink>
        </FiltroLinha>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <p className="text-secondary text-sm" aria-live="polite">
          <span className="num font-bold">{resultado.total}</span>{" "}
          {resultado.total === 1 ? "técnico encontrado" : "técnicos encontrados"}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow">Ordenar</span>
          {ORDENACOES.map(([valor, rotulo]) => (
            <ChipLink
              key={valor}
              href={linkCom({ ordenar: valor })}
              ativo={filtros.ordenar === valor}
            >
              {rotulo}
            </ChipLink>
          ))}
        </div>
      </div>

      {resultado.prestadores.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            title="Nenhum técnico com esses filtros"
            description="Tente ampliar a busca removendo filtros, ou escolha outra cidade. Se você é técnico de climatização, cadastre-se e atenda esta região."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/tecnicos" variant="secondary">
                  Limpar filtros
                </ButtonLink>
                <ButtonLink href="/seja-prestador">Quero ser prestador</ButtonLink>
              </div>
            }
          />
        </Card>
      ) : (
        <ProviderSearchResults tecnicos={resultado.prestadores} />
      )}

      {resultado.totalPaginas > 1 && (
        <nav aria-label="Paginação" className="mt-8 flex justify-center gap-2">
          {Array.from({ length: resultado.totalPaginas }, (_, i) => i + 1).map((n) => {
            const params = new URLSearchParams();
            for (const [chave, valor] of Object.entries(raw)) {
              if (typeof valor === "string" && valor !== "") params.set(chave, valor);
            }
            params.set("pagina", String(n));
            return (
              <ChipLink
                key={n}
                href={`/tecnicos?${params.toString()}`}
                ativo={resultado.pagina === n}
              >
                {n}
              </ChipLink>
            );
          })}
        </nav>
      )}
    </main>
  );
}

function FiltroLinha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="eyebrow w-full sm:w-auto sm:pr-1.5">{titulo}</span>
      {children}
    </div>
  );
}

function ChipLink({
  href,
  ativo,
  children,
}: {
  href: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "true" : undefined}
      className={`rounded-(--radius-pill) border px-3.5 py-2 text-[0.8125rem] font-medium transition-all duration-250 ${
        ativo
          ? "bg-grad border-transparent text-white"
          : "surface-card hover:border-[var(--accent-border)]"
      }`}
    >
      {children}
    </Link>
  );
}
