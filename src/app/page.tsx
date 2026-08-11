import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { Badge, ButtonLink, Card, EmptyState, Rating } from "@/ui";

export const metadata: Metadata = {
  title: "Técnicos de ar-condicionado perto de você",
  description:
    "Encontre profissionais de climatização próximos, negocie o valor e contrate serviços de ar-condicionado com pagamento seguro. Limpeza, instalação, manutenção e carga de gás.",
  alternates: { canonical: "/" },
};

// Catálogo muda pouco: revalidação horária mantém o HTML estático e rápido (§61).
export const revalidate = 3600;

const COMO_FUNCIONA = [
  {
    titulo: "Descreva o serviço",
    texto:
      "Conte o que precisa, envie fotos do aparelho e diga quanto pretende pagar.",
  },
  {
    titulo: "Receba propostas",
    texto:
      "Técnicos verificados da sua região respondem com preço e prazo. Você negocia direto no chat.",
  },
  {
    titulo: "Contrate com segurança",
    texto:
      "O pagamento fica retido na plataforma e só é liberado ao técnico após o serviço concluído.",
  },
  {
    titulo: "Avalie o atendimento",
    texto:
      "Depois da conclusão, sua avaliação ajuda a manter a qualidade da rede.",
  },
];

const FAQ = [
  {
    pergunta: "Quanto custa usar a plataforma?",
    resposta:
      "Para o cliente, buscar técnicos e receber propostas é gratuito. A plataforma cobra uma comissão do profissional apenas sobre serviços efetivamente concluídos.",
  },
  {
    pergunta: "Como funciona o pagamento?",
    resposta:
      "Você paga pela plataforma via PIX ou cartão. O valor fica retido e só é repassado ao técnico após a conclusão do serviço e o período de segurança sem contestação.",
  },
  {
    pergunta: "E se o serviço não for bem executado?",
    resposta:
      "Você pode abrir uma disputa antes da liberação do pagamento. O valor fica bloqueado enquanto nossa equipe analisa as evidências das duas partes.",
  },
  {
    pergunta: "Os técnicos são verificados?",
    resposta:
      "Profissionais com o selo de verificação passaram por análise de documentos, dados fiscais e comprovação de experiência antes de receber solicitações.",
  },
];

export default async function HomePage() {
  const [categorias, cidades, destaques, totalConcluidos] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
      take: 10,
    }),
    prisma.city.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.providerProfile.findMany({
      where: { status: "APROVADO", deletedAt: null },
      orderBy: [{ reputationScore: "desc" }, { ratingAverage: "desc" }],
      take: 6,
      include: {
        city: true,
        services: {
          where: { active: true },
          orderBy: { fromPriceCents: "asc" },
          take: 1,
          include: { category: true },
        },
      },
    }),
    prisma.marketplaceOrder.count({ where: { status: "LIQUIDADA" } }),
  ]);

  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        {/* ---------------------------------------------------------------- */}
        {/* HERO                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="from-brand-950 via-brand-900 to-brand-800 relative overflow-hidden bg-gradient-to-br text-white">
          <div
            aria-hidden="true"
            className="bg-ice-400/20 absolute -top-32 -right-24 h-96 w-96 rounded-full blur-3xl"
          />
          <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-20 sm:pt-24 sm:pb-28">
            <Badge tone="ice" className="mb-6">
              Pagamento protegido em todos os serviços
            </Badge>

            <h1 className="max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Seu ar-condicionado nas mãos de quem entende.
            </h1>

            <p className="text-brand-100 mt-5 max-w-2xl text-lg leading-relaxed text-pretty sm:text-xl">
              Encontre profissionais próximos, negocie o valor e contrate serviços de
              climatização com segurança.
            </p>

            <search className="mt-9 block">
              <form action="/tecnicos" method="get" className="max-w-2xl" role="search">
                <div className="surface-card flex flex-col gap-2 rounded-(--radius-card) p-2 shadow-(--shadow-float) sm:flex-row">
                  <label htmlFor="busca" className="sr-only">
                    O que você precisa?
                  </label>
                  <input
                    id="busca"
                    name="q"
                    type="search"
                    placeholder="Ex.: limpeza de split ou “meu ar não está gelando”"
                    className="h-12 flex-1 rounded-(--radius-field) bg-transparent px-4 text-[0.9375rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="submit"
                    className="bg-brand-600 hover:bg-brand-700 h-12 rounded-(--radius-field) px-7 font-medium text-white transition-colors"
                  >
                    Buscar
                  </button>
                </div>
              </form>
            </search>

            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/tecnicos" size="lg" variant="secondary">
                Encontrar técnico
              </ButtonLink>
              <ButtonLink
                href="/seja-prestador"
                size="lg"
                variant="ghost"
                className="text-white hover:bg-white/10 active:bg-white/15"
              >
                Quero ser prestador
              </ButtonLink>
            </div>

            <dl className="border-brand-700/60 mt-12 grid grid-cols-2 gap-6 border-t pt-8 sm:grid-cols-4">
              <Stat label="Categorias de serviço" value={String(categorias.length)} />
              <Stat label="Cidades atendidas" value={String(cidades.length)} />
              <Stat label="Serviços concluídos" value={String(totalConcluidos)} />
              <Stat label="Pagamento retido até a conclusão" value="100%" />
            </dl>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* CATEGORIAS                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Serviços"
            title="O que você precisa hoje?"
            description="Da limpeza preventiva ao atendimento emergencial, com preço combinado antes da visita."
          />

          <ul className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.map((categoria) => (
              <li key={categoria.id}>
                <Link
                  href={`/servicos/${categoria.slug}`}
                  className="hover:border-brand-300 hover:shadow-(--shadow-raised) surface-card group flex h-full flex-col rounded-(--radius-card) p-5 transition-all"
                >
                  <h3 className="group-hover:text-brand-700 dark:group-hover:text-brand-300 font-semibold transition-colors">
                    {categoria.name}
                  </h3>
                  <p className="text-secondary mt-1.5 flex-1 text-sm leading-relaxed">
                    {categoria.description}
                  </p>
                  {categoria.basePriceCents !== null && (
                    <p className="text-muted mt-3 text-xs">
                      a partir de{" "}
                      <span className="text-brand-700 dark:text-brand-300 font-semibold">
                        {formatBRL(money(categoria.basePriceCents))}
                      </span>
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* PROFISSIONAIS                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-[var(--surface-muted)] py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHeading
              eyebrow="Profissionais"
              title="Técnicos verificados perto de você"
              description="Perfis com histórico, avaliações reais e tempo médio de resposta."
            />

            {destaques.length === 0 ? (
              <Card className="mt-9">
                <EmptyState
                  title="Ainda não há técnicos aprovados nesta região"
                  description="Estamos credenciando profissionais. Se você é técnico de climatização, cadastre-se e comece a receber solicitações."
                  action={
                    <ButtonLink href="/seja-prestador">Quero ser prestador</ButtonLink>
                  }
                />
              </Card>
            ) : (
              <ul className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {destaques.map((tecnico) => {
                  const servico = tecnico.services[0];
                  return (
                    <li key={tecnico.id}>
                      <Card className="h-full p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">
                              {tecnico.displayName}
                            </h3>
                            <p className="text-muted mt-0.5 text-sm">
                              {tecnico.neighborhood
                                ? `${tecnico.neighborhood}, `
                                : ""}
                              {tecnico.city?.name ?? "Região não informada"}
                            </p>
                          </div>
                          {tecnico.verified && <Badge tone="success">Verificado</Badge>}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                          {tecnico.ratingCount > 0 ? (
                            <Rating
                              value={tecnico.ratingAverage}
                              count={tecnico.ratingCount}
                            />
                          ) : (
                            <span className="text-muted text-sm">Sem avaliações ainda</span>
                          )}
                          {tecnico.yearsOfExperience !== null && (
                            <span className="text-secondary text-sm">
                              {tecnico.yearsOfExperience} anos de experiência
                            </span>
                          )}
                        </div>

                        {tecnico.bio && (
                          <p className="text-secondary mt-3 line-clamp-3 text-sm leading-relaxed">
                            {tecnico.bio}
                          </p>
                        )}

                        <div className="mt-4 flex items-end justify-between gap-3">
                          {servico && (
                            <p className="text-muted text-xs">
                              {servico.category.name}
                              <br />
                              <span className="text-brand-700 dark:text-brand-300 text-sm font-semibold">
                                a partir de {formatBRL(money(servico.fromPriceCents))}
                              </span>
                            </p>
                          )}
                          <ButtonLink
                            href={`/tecnico/${tecnico.slug}`}
                            size="sm"
                            variant="secondary"
                          >
                            Ver perfil
                          </ButtonLink>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* COMO FUNCIONA                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Como funciona"
            title="Do orçamento ao pagamento, tudo em um lugar"
            description="Você acompanha cada etapa pela plataforma — sem combinar valor por fora."
          />

          <ol className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {COMO_FUNCIONA.map((passo, index) => (
              <li key={passo.titulo} className="relative">
                <Card className="h-full p-5">
                  <span className="bg-brand-600 mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold">{passo.titulo}</h3>
                  <p className="text-secondary mt-1.5 text-sm leading-relaxed">
                    {passo.texto}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SEGURANÇA                                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-brand-950 py-16 text-white sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-ice-300 text-sm font-semibold tracking-wide uppercase">
                  Segurança
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                  Seu dinheiro só é liberado depois do serviço feito
                </h2>
                <p className="text-brand-100 mt-4 leading-relaxed text-pretty">
                  O valor pago fica retido na plataforma. O técnico só recebe após a
                  conclusão confirmada e o período de segurança sem contestação. Se algo
                  der errado, você abre uma disputa e o valor permanece bloqueado até a
                  análise.
                </p>
                <div className="mt-6">
                  <ButtonLink href="/seguranca" variant="secondary">
                    Como protegemos seu pagamento
                  </ButtonLink>
                </div>
              </div>

              <ul className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Pagamento retido", "O valor fica na plataforma até a conclusão."],
                  ["Técnicos verificados", "Documentos e experiência analisados."],
                  ["Valor combinado antes", "Nada de surpresa no fim do serviço."],
                  ["Suporte em disputas", "Mediação com análise de evidências."],
                ].map(([titulo, texto]) => (
                  <li
                    key={titulo}
                    className="border-brand-800 bg-brand-900/60 rounded-(--radius-card) border p-4"
                  >
                    <h3 className="text-ice-200 font-semibold">{titulo}</h3>
                    <p className="text-brand-200 mt-1 text-sm leading-relaxed">{texto}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* CTA PRESTADOR                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <Card className="from-ice-50 to-brand-50 dark:from-brand-950 dark:to-ink-900 bg-gradient-to-br p-8 sm:p-12">
            <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                  É técnico de climatização? Receba solicitações da sua região.
                </h2>
                <p className="text-secondary mt-3 leading-relaxed text-pretty">
                  Cadastro gratuito. Você define sua área de atendimento, seus preços de
                  referência e recebe apenas serviços compatíveis com suas
                  especialidades. A comissão incide somente sobre serviços concluídos.
                </p>
              </div>
              <ButtonLink href="/seja-prestador" size="lg" className="shrink-0">
                Começar cadastro
              </ButtonLink>
            </div>
          </Card>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* CIDADES (links SEO)                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-[var(--surface-muted)] py-14">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-lg font-semibold">Cidades atendidas</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {cidades.map((cidade) => (
                <li key={cidade.id}>
                  <Link
                    href={`/tecnicos/${cidade.slug}`}
                    className="surface-card hover:border-brand-300 inline-block rounded-full px-4 py-2 text-sm transition-colors"
                  >
                    Ar-condicionado em {cidade.name}
                    <span className="text-muted"> · {cidade.state}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* FAQ (com structured data)                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Perguntas frequentes
          </h2>
          <div className="mt-7 flex flex-col gap-3">
            {FAQ.map((item) => (
              <details
                key={item.pergunta}
                className="surface-card group rounded-(--radius-card) p-5"
              >
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.pergunta}
                    <span
                      aria-hidden="true"
                      className="text-brand-500 shrink-0 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="text-secondary mt-3 text-sm leading-relaxed">
                  {item.resposta}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter categorias={categorias} cidades={cidades} />

      {/* Structured data (§50) */}
      <script
        type="application/ld+json"
        // Conteúdo estático controlado por nós — não há entrada de usuário aqui.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                name: "AirFlow",
                description:
                  "Marketplace de serviços de ar-condicionado e climatização.",
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: "/tecnicos?q={search_term_string}",
                  },
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@type": "FAQPage",
                mainEntity: FAQ.map((item) => ({
                  "@type": "Question",
                  name: item.pergunta,
                  acceptedAnswer: { "@type": "Answer", text: item.resposta },
                })),
              },
            ],
          }),
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-brand-200 text-sm">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-brand-600 dark:text-brand-300 text-sm font-semibold tracking-wide uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      <p className="text-secondary mt-3 leading-relaxed text-pretty">{description}</p>
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="surface-card sticky top-0 z-40 border-x-0 border-t-0 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="from-brand-600 to-ice-500 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M3 7h13a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3V7zm0 5h16a3 3 0 1 1-3 3h2a1 1 0 1 0-1-1H3v-2zm0 5h9a2.5 2.5 0 1 1-2.5 2.5h2A.5.5 0 1 0 12 19H3v-2z" />
            </svg>
          </span>
          AirFlow
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-6 text-sm md:flex">
          <Link href="/tecnicos" className="hover:text-brand-600 transition-colors">
            Encontrar técnico
          </Link>
          <Link href="/servicos" className="hover:text-brand-600 transition-colors">
            Serviços
          </Link>
          <Link href="/como-funciona" className="hover:text-brand-600 transition-colors">
            Como funciona
          </Link>
          <Link href="/seja-prestador" className="hover:text-brand-600 transition-colors">
            Seja prestador
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/entrar" variant="ghost" size="sm">
            Entrar
          </ButtonLink>
          {/* max-sm:hidden em vez de "hidden sm:inline-flex": a classe base já
              tem inline-flex, e a disputa entre duas utilities de display é
              resolvida pela ordem no CSS gerado, não pela ordem no atributo. */}
          <ButtonLink href="/cadastrar" size="sm" className="max-sm:hidden">
            Criar conta
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

function SiteFooter({
  categorias,
  cidades,
}: {
  categorias: { id: string; slug: string; name: string }[];
  cidades: { id: string; slug: string; name: string }[];
}) {
  return (
    <footer className="bg-ink-950 text-ink-300 py-14">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold text-white">AirFlow</p>
            <p className="mt-2 text-sm leading-relaxed">
              Marketplace de serviços de ar-condicionado e climatização com pagamento
              protegido.
            </p>
          </div>

          <nav aria-labelledby="footer-servicos">
            <h2 id="footer-servicos" className="font-semibold text-white">
              Serviços
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {categorias.slice(0, 6).map((categoria) => (
                <li key={categoria.id}>
                  <Link
                    href={`/servicos/${categoria.slug}`}
                    className="hover:text-white transition-colors"
                  >
                    {categoria.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-cidades">
            <h2 id="footer-cidades" className="font-semibold text-white">
              Cidades
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {cidades.slice(0, 6).map((cidade) => (
                <li key={cidade.id}>
                  <Link
                    href={`/tecnicos/${cidade.slug}`}
                    className="hover:text-white transition-colors"
                  >
                    {cidade.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-institucional">
            <h2 id="footer-institucional" className="font-semibold text-white">
              Institucional
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li>
                <Link href="/como-funciona" className="hover:text-white transition-colors">
                  Como funciona
                </Link>
              </li>
              <li>
                <Link href="/seguranca" className="hover:text-white transition-colors">
                  Segurança
                </Link>
              </li>
              <li>
                <Link href="/seja-prestador" className="hover:text-white transition-colors">
                  Seja prestador
                </Link>
              </li>
              <li>
                <Link href="/termos" className="hover:text-white transition-colors">
                  Termos de uso
                </Link>
              </li>
              <li>
                <Link href="/privacidade" className="hover:text-white transition-colors">
                  Política de privacidade
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <p className="border-ink-800 mt-10 border-t pt-6 text-xs">
          © {new Date().getFullYear()} AirFlow. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
