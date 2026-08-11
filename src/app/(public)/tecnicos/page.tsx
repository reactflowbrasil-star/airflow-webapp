import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { searchProvidersSchema } from "@/lib/validation/marketplace";
import { prisma } from "@/server/db/prisma";
import { buscarPrestadores } from "@/server/services/search-service";
import { Badge, ButtonLink, Card, EmptyState, Rating } from "@/ui";
import { SiteFooter, SiteHeader } from "@/ui/site-chrome";

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
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Técnicos de ar-condicionado
        </h1>

        {/* Busca por intenção (§11) */}
        <search className="mt-5 block">
          <form action="/tecnicos" method="get" role="search" className="max-w-2xl">
            {filtros.cidade && <input type="hidden" name="cidade" value={filtros.cidade} />}
            <div className="surface-card flex gap-2 rounded-(--radius-card) p-2 shadow-(--shadow-subtle)">
              <label htmlFor="q" className="sr-only">
                O que você precisa?
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={filtros.q ?? ""}
                placeholder="Ex.: limpeza de split ou “meu ar não está gelando”"
                className="h-11 flex-1 rounded-(--radius-field) bg-transparent px-3 outline-none placeholder:text-[var(--text-muted)]"
              />
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 h-11 rounded-(--radius-field) px-6 font-medium text-white transition-colors"
              >
                Buscar
              </button>
            </div>
          </form>
        </search>

        {resultado.categoriaInferida && (
          <p className="text-secondary mt-3 text-sm">
            Entendemos que você precisa de{" "}
            <Link
              href={linkCom({ categoria: resultado.categoriaInferida.slug, q: undefined })}
              className="text-brand-600 font-medium hover:underline"
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

        {/* Filtros (§10) */}
        <div className="mt-6 flex flex-col gap-3">
          <FiltroLinha titulo="Serviço">
            <Chip href={linkCom({ categoria: undefined })} ativo={!filtros.categoria}>
              Todos
            </Chip>
            {categorias.map((c) => (
              <Chip
                key={c.slug}
                href={linkCom({ categoria: c.slug, q: undefined })}
                ativo={filtros.categoria === c.slug}
              >
                {c.name}
              </Chip>
            ))}
          </FiltroLinha>

          <FiltroLinha titulo="Cidade">
            <Chip href={linkCom({ cidade: undefined })} ativo={!filtros.cidade}>
              Todas
            </Chip>
            {cidades.map((c) => (
              <Chip
                key={c.slug}
                href={linkCom({ cidade: c.slug })}
                ativo={filtros.cidade === c.slug}
              >
                {c.name}/{c.state}
              </Chip>
            ))}
          </FiltroLinha>

          <FiltroLinha titulo="Filtros">
            <Chip
              href={linkCom({ verificados: filtros.verificados ? undefined : "true" })}
              ativo={Boolean(filtros.verificados)}
            >
              Somente verificados
            </Chip>
            <Chip
              href={linkCom({ emergencia: filtros.emergencia ? undefined : "true" })}
              ativo={Boolean(filtros.emergencia)}
            >
              Atende emergência
            </Chip>
            <Chip
              href={linkCom({ comercial: filtros.comercial ? undefined : "true" })}
              ativo={Boolean(filtros.comercial)}
            >
              Atende comercial
            </Chip>
            <Chip
              href={linkCom({ notaMin: filtros.notaMin ? undefined : "4" })}
              ativo={Boolean(filtros.notaMin)}
            >
              Nota 4+
            </Chip>
          </FiltroLinha>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <p className="text-secondary text-sm" aria-live="polite">
            {resultado.total === 0
              ? "Nenhum técnico encontrado"
              : `${resultado.total} ${resultado.total === 1 ? "técnico encontrado" : "técnicos encontrados"}`}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted text-sm">Ordenar:</span>
            {ORDENACOES.map(([valor, rotulo]) => (
              <Chip
                key={valor}
                href={linkCom({ ordenar: valor })}
                ativo={filtros.ordenar === valor}
              >
                {rotulo}
              </Chip>
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
          <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resultado.prestadores.map((tecnico) => (
              <li key={tecnico.id}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">
                        <Link
                          href={`/tecnico/${tecnico.slug}`}
                          className="hover:text-brand-600 transition-colors"
                        >
                          {tecnico.displayName}
                        </Link>
                      </h2>
                      <p className="text-muted mt-0.5 text-sm">
                        {[tecnico.bairro, tecnico.cidade].filter(Boolean).join(", ") ||
                          "Região não informada"}
                        {tecnico.distanciaKm !== null && (
                          <span> · ~{tecnico.distanciaKm} km</span>
                        )}
                      </p>
                    </div>
                    {tecnico.verified && <Badge tone="success">Verificado</Badge>}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {tecnico.ratingCount > 0 ? (
                      <Rating value={tecnico.ratingAverage} count={tecnico.ratingCount} />
                    ) : (
                      <span className="text-muted">Sem avaliações ainda</span>
                    )}
                    {tecnico.completedServices > 0 && (
                      <span className="text-secondary">
                        {tecnico.completedServices} serviços
                      </span>
                    )}
                  </div>

                  {tecnico.bio && (
                    <p className="text-secondary mt-3 line-clamp-2 flex-1 text-sm leading-relaxed">
                      {tecnico.bio}
                    </p>
                  )}

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <p className="text-muted text-xs">
                      {tecnico.aPartirDeCents !== null ? (
                        <>
                          a partir de
                          <br />
                          <span className="text-brand-700 dark:text-brand-300 text-sm font-semibold">
                            {formatBRL(money(tecnico.aPartirDeCents))}
                          </span>
                        </>
                      ) : (
                        "Preço sob orçamento"
                      )}
                    </p>
                    <ButtonLink href={`/tecnico/${tecnico.slug}`} size="sm">
                      Ver perfil
                    </ButtonLink>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
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
                <Chip
                  key={n}
                  href={`/tecnicos?${params.toString()}`}
                  ativo={resultado.pagina === n}
                >
                  {n}
                </Chip>
              );
            })}
          </nav>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function FiltroLinha({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted w-full text-xs font-medium tracking-wide uppercase sm:w-auto sm:pr-1">
        {titulo}
      </span>
      {children}
    </div>
  );
}

function Chip({
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
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        ativo
          ? "border-brand-600 bg-brand-600 text-white"
          : "surface-card hover:border-brand-300"
      }`}
    >
      {children}
    </Link>
  );
}
