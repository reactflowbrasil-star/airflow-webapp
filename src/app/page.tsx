import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { consultaTolerante } from "@/server/db/prerender";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  HoverCard,
  IconBox,
  LiveDot,
  Rating,
} from "@/ui";
import { Faq } from "@/ui/faq";
import { HeroArt } from "@/ui/hero-art";
import { TopNav } from "@/ui/top-nav";

export const metadata: Metadata = {
  title: "Técnicos de ar-condicionado perto de você",
  description:
    "Encontre profissionais de climatização próximos, negocie o valor e contrate serviços de ar-condicionado com pagamento seguro. Limpeza, instalação, manutenção e carga de gás.",
  alternates: { canonical: "/" },
};

// Catálogo muda pouco: revalidação horária mantém o HTML estático e rápido (§61).
export const revalidate = 3600;

/** Ícone Phosphor por categoria (handoff). Fallback para serviços novos. */
const ICONE_CATEGORIA: Record<string, string> = {
  "limpeza-ar-condicionado": "drop",
  "instalacao-ar-condicionado": "wrench",
  "manutencao-preventiva": "gear-six",
  "manutencao-corretiva": "wrench",
  "carga-de-gas": "gas-can",
  desinstalacao: "gear-six",
  reinstalacao: "wrench",
  diagnostico: "note-pencil",
  "troca-de-componentes": "gear-six",
  "atendimento-emergencial": "siren",
};

const COMO_FUNCIONA = [
  {
    icone: "note-pencil",
    titulo: "Descreva o serviço",
    texto: "Conte o que precisa, envie fotos do aparelho e diga quanto pretende pagar.",
  },
  {
    icone: "chats-circle",
    titulo: "Receba propostas",
    texto:
      "Técnicos verificados da sua região respondem com preço e prazo. Você negocia direto pela plataforma.",
  },
  {
    icone: "shield-check",
    titulo: "Contrate com segurança",
    texto:
      "O pagamento fica retido e só é liberado ao técnico após o serviço concluído.",
  },
  {
    icone: "star",
    titulo: "Avalie o atendimento",
    texto: "Depois da conclusão, sua avaliação ajuda a manter a qualidade da rede.",
  },
];

const PILARES = [
  {
    icone: "lock-key",
    titulo: "Pagamento retido",
    texto: "O valor fica na plataforma até a conclusão confirmada.",
  },
  {
    icone: "seal-check",
    titulo: "Técnicos verificados",
    texto: "Documentos, dados fiscais e experiência analisados antes de atender.",
  },
  {
    icone: "handshake",
    titulo: "Valor combinado antes",
    texto: "Nada de surpresa no fim do serviço: o preço é acordado por escrito.",
  },
  {
    icone: "lifebuoy",
    titulo: "Suporte em disputas",
    texto: "Mediação com análise das evidências das duas partes.",
  },
];

const DEPOIMENTOS = [
  {
    texto:
      "Pedi limpeza de dois splits numa sexta e o técnico veio no sábado de manhã. O valor combinado foi exatamente o que paguei.",
    autor: "Camila R.",
    contexto: "Limpeza · Vila Mariana, SP",
    nota: 5,
  },
  {
    texto:
      "O que me convenceu foi o dinheiro ficar preso até o serviço acabar. Já tive dor de cabeça pagando adiantado por fora.",
    autor: "Douglas M.",
    contexto: "Instalação · Pinheiros, SP",
    nota: 5,
  },
  {
    texto:
      "Negociei o preço pelo chat sem constrangimento. Ele contrapropôs, eu ajustei e fechamos num valor justo pros dois.",
    autor: "Renata P.",
    contexto: "Manutenção corretiva · Santo Amaro, SP",
    nota: 4,
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
    consultaTolerante("home:categorias", () => prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
      take: 6,
    }), []),
    consultaTolerante(
      "home:cidades",
      () => prisma.city.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      [],
    ),
    consultaTolerante("home:destaques", () => prisma.providerProfile.findMany({
      where: { status: "APROVADO", deletedAt: null },
      orderBy: [{ reputationScore: "desc" }, { ratingAverage: "desc" }],
      take: 3,
      include: {
        city: true,
        services: {
          where: { active: true },
          orderBy: { fromPriceCents: "asc" },
          take: 1,
          include: { category: true },
        },
      },
    }), []),
    consultaTolerante(
      "home:concluidos",
      () => prisma.marketplaceOrder.count({ where: { status: "LIQUIDADA" } }),
      0,
    ),
  ]);

  const notaMedia =
    destaques.filter((d) => d.ratingCount > 0).reduce((a, d) => a + d.ratingAverage, 0) /
      Math.max(destaques.filter((d) => d.ratingCount > 0).length, 1) || 4.8;

  return (
    <>
      <TopNav />

      <main id="conteudo" className="anim-fade mx-auto max-w-6xl px-5 pb-20">
        {/* ================================================================ */}
        {/* HERO                                                             */}
        {/* ================================================================ */}
        <section
          className="anim-rise relative mt-6 overflow-hidden rounded-(--radius-hero) border p-8 sm:p-12 lg:px-13 lg:pt-15 lg:pb-11"
          style={{
            background: "linear-gradient(150deg,var(--surface-card),var(--accent-soft))",
          }}
        >
          <div className="grid gap-9 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            <div className="min-w-0 lg:max-w-[620px]">
              <span className="accent-soft inline-flex items-center gap-2 rounded-(--radius-pill) border px-3.5 py-1.5 text-[var(--accent-text)] whitespace-nowrap">
                <LiveDot />
                <span className="eyebrow text-[var(--accent-text)]">
                  Pagamento protegido
                </span>
              </span>

              <h1 className="mt-5 text-[clamp(38px,5.2vw,76px)] leading-none font-extrabold tracking-[-0.045em] text-balance">
                Seu ar-condicionado nas mãos de{" "}
                <span className="text-[var(--accent-text)]">quem entende</span>.
              </h1>

              <p className="text-secondary mt-5 max-w-[560px] text-[1.0625rem] leading-relaxed text-pretty">
                Encontre profissionais próximos, negocie o valor e contrate serviços de
                climatização com segurança.
              </p>

              <search className="mt-7 block">
                <form action="/tecnicos" method="get" role="search" className="max-w-[560px]">
                  <div className="surface-card flex flex-col gap-2 rounded-[18px] p-2 shadow-(--shadow-float) sm:flex-row">
                    <label htmlFor="busca" className="sr-only">
                      O que você precisa?
                    </label>
                    <input
                      id="busca"
                      name="q"
                      type="search"
                      placeholder="Ex.: limpeza de split ou “meu ar não está gelando”"
                      className="h-[50px] min-w-0 flex-1 rounded-(--radius-pill) bg-transparent px-4 text-[0.9375rem] outline-none placeholder:text-[var(--text-muted)]"
                    />
                    <button
                      type="submit"
                      className="bg-grad h-[50px] shrink-0 rounded-(--radius-pill) px-7 font-semibold text-white transition-transform duration-250 hover:-translate-y-0.5"
                    >
                      Buscar
                    </button>
                  </div>
                </form>
              </search>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <ButtonLink href="/tecnicos" variant="secondary">
                  Encontrar técnico
                </ButtonLink>
                <ButtonLink href="/seja-prestador" variant="secondary">
                  Quero ser prestador
                </ButtonLink>
              </div>
            </div>

            <HeroArt />
          </div>

          <dl className="mt-11 grid gap-6 border-t pt-8 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
            <Stat valor={String(categorias.length)} rotulo="Categorias de serviço" />
            <Stat valor={String(cidades.length)} rotulo="Cidades atendidas" />
            <Stat valor={String(totalConcluidos)} rotulo="Serviços concluídos" />
            <Stat valor="100%" rotulo="Pagamento retido até a conclusão" />
          </dl>
        </section>

        {/* ================================================================ */}
        {/* SERVIÇOS                                                         */}
        {/* ================================================================ */}
        <section className="mt-13">
          <SectionHeading
            eyebrow="Serviços"
            titulo="O que você precisa hoje?"
            descricao="Da limpeza preventiva ao atendimento emergencial, com preço combinado antes da visita."
          />

          <ul className="mt-8 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {categorias.map((categoria, i) => (
              <li key={categoria.id} className="min-w-0">
                <Link href={`/servicos/${categoria.slug}`} className="group block h-full">
                  <HoverCard className="flex h-full flex-col p-6">
                    <div className="flex items-start justify-between gap-3">
                      <IconBox name={ICONE_CATEGORIA[categoria.slug] ?? "gear-six"} />
                      <span className="num text-muted text-sm font-semibold">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <h3 className="mt-4 text-[1.125rem] font-bold tracking-[-0.02em]">
                      {categoria.name}
                    </h3>
                    <p className="text-secondary mt-2 flex-1 text-[0.9375rem] leading-relaxed">
                      {categoria.description}
                    </p>

                    {categoria.basePriceCents !== null && (
                      <div className="mt-5 flex items-center justify-between border-t pt-4">
                        <p className="text-muted text-[0.8125rem]">
                          a partir de{" "}
                          <span className="num font-bold text-[var(--accent-text)]">
                            {formatBRL(money(categoria.basePriceCents))}
                          </span>
                        </p>
                        <span
                          aria-hidden="true"
                          className="accent-soft flex h-8 w-8 items-center justify-center rounded-full border text-[var(--accent-text)] transition-transform duration-250 group-hover:translate-x-1"
                        >
                          →
                        </span>
                      </div>
                    )}
                  </HoverCard>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ================================================================ */}
        {/* COMO FUNCIONA                                                    */}
        {/* ================================================================ */}
        <section className="mt-13">
          <SectionHeading
            eyebrow="Como funciona"
            titulo="Do orçamento ao pagamento, tudo em um lugar"
            descricao="Você acompanha cada etapa pela plataforma — sem combinar valor por fora."
          />

          <Card className="mt-8 p-6 sm:p-8">
            <ol className="grid gap-7 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {COMO_FUNCIONA.map((passo, i) => (
                <li key={passo.titulo} className="min-w-0">
                  <IconBox name={passo.icone} tone="grad" size={46} />
                  <h3 className="mt-4 font-bold tracking-[-0.02em]">
                    <span className="num text-muted mr-1.5 text-sm">0{i + 1}</span>
                    {passo.titulo}
                  </h3>
                  <p className="text-secondary mt-1.5 text-[0.875rem] leading-relaxed">
                    {passo.texto}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        {/* ================================================================ */}
        {/* TÉCNICOS                                                         */}
        {/* ================================================================ */}
        <section className="mt-13">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Profissionais"
              titulo="Técnicos cadastrados"
              descricao="Perfis com histórico, avaliações reais e tempo médio de resposta."
            />
            <Link
              href="/tecnicos"
              className="text-[0.9375rem] font-semibold text-[var(--accent-text)] hover:underline"
            >
              Ver todos os técnicos →
            </Link>
          </div>

          {destaques.length === 0 ? (
            <Card className="mt-8">
              <EmptyState
                title="Ainda não há técnicos aprovados nesta região"
                description="Estamos credenciando profissionais. Se você é técnico de climatização, cadastre-se e comece a receber solicitações."
                action={<ButtonLink href="/seja-prestador">Quero ser prestador</ButtonLink>}
              />
            </Card>
          ) : (
            <ul className="mt-8 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
              {destaques.map((tecnico) => (
                <li key={tecnico.id} className="min-w-0">
                  <HoverCard className="flex h-full flex-col p-6">
                    <div className="flex items-start gap-3.5">
                      <span className="bg-grad grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-lg font-bold text-white">
                        {tecnico.displayName.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-bold tracking-[-0.02em]">
                          {tecnico.displayName}
                        </h3>
                        <p className="text-muted mt-0.5 truncate text-[0.8125rem]">
                          {[tecnico.neighborhood, tecnico.city?.name]
                            .filter(Boolean)
                            .join(", ") || "Região não informada"}
                        </p>
                      </div>
                      {tecnico.verified && <Badge tone="success">Verificado</Badge>}
                    </div>

                    <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {tecnico.ratingCount > 0 ? (
                        <Rating value={tecnico.ratingAverage} count={tecnico.ratingCount} />
                      ) : (
                        <span className="text-muted text-sm">Sem avaliações ainda</span>
                      )}
                      <span className="num text-secondary text-sm">
                        {tecnico.completedServices} serviços
                      </span>
                    </div>

                    {tecnico.bio && (
                      <p className="text-secondary mt-3.5 line-clamp-3 flex-1 text-[0.875rem] leading-relaxed">
                        {tecnico.bio}
                      </p>
                    )}

                    <div className="mt-5 flex items-end justify-between gap-3 border-t pt-4">
                      {tecnico.services[0] ? (
                        <p className="text-muted text-xs">
                          {tecnico.services[0].category.name}
                          <br />
                          <span className="num text-[0.9375rem] font-bold text-[var(--accent-text)]">
                            {formatBRL(money(tecnico.services[0].fromPriceCents))}
                          </span>
                        </p>
                      ) : (
                        <span className="text-muted text-xs">Sob orçamento</span>
                      )}
                      <ButtonLink href={`/tecnico/${tecnico.slug}`} size="sm">
                        Ver perfil
                      </ButtonLink>
                    </div>
                  </HoverCard>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ================================================================ */}
        {/* AVALIAÇÕES                                                       */}
        {/* ================================================================ */}
        <section className="mt-13">
          <Card className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SectionHeading
                eyebrow="Avaliações"
                titulo="Quem contratou, aprovou"
                descricao="Só quem contratou pela plataforma pode avaliar."
              />
              <span className="accent-soft inline-flex items-center gap-2 rounded-(--radius-pill) border px-4 py-2.5">
                <span className="num text-2xl font-extrabold text-[var(--accent-text)]">
                  {notaMedia.toFixed(1).replace(".", ",")}
                </span>
                <span className="text-secondary text-[0.8125rem]">nota média</span>
              </span>
            </div>

            <ul className="mt-7 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
              {DEPOIMENTOS.map((d) => (
                <li key={d.autor} className="min-w-0">
                  <div className="surface-muted h-full rounded-[18px] p-5">
                    <span
                      aria-hidden="true"
                      className="block text-3xl leading-none font-extrabold text-[var(--accent-border)]"
                    >
                      “
                    </span>
                    <p className="text-secondary mt-1 text-[0.9375rem] leading-relaxed">
                      {d.texto}
                    </p>
                    <div className="mt-4 flex items-center gap-2.5">
                      <span className="bg-grad grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white">
                        {d.autor.slice(0, 1)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[0.8125rem] font-semibold">{d.autor}</p>
                        <p className="text-muted truncate text-xs">{d.contexto}</p>
                      </div>
                      <span className="ml-auto">
                        <Rating value={d.nota} />
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* ================================================================ */}
        {/* SEGURANÇA                                                        */}
        {/* ================================================================ */}
        <section className="mt-13">
          <div className="grid gap-9 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            <div className="min-w-0">
              <SectionHeading
                eyebrow="Segurança"
                titulo="Seu dinheiro só é liberado depois do serviço feito"
                descricao="O valor pago fica retido na plataforma. O técnico só recebe após a conclusão confirmada e o período de segurança sem contestação. Se algo der errado, você abre uma disputa e o valor permanece bloqueado até a análise."
              />
              <div className="mt-6">
                <ButtonLink href="/seguranca">Como protegemos seu pagamento</ButtonLink>
              </div>
            </div>

            <ul className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {PILARES.map((pilar) => (
                <li key={pilar.titulo} className="min-w-0">
                  <Card className="h-full p-5">
                    <IconBox name={pilar.icone} size={38} />
                    <h3 className="mt-3 font-bold tracking-[-0.02em] text-[var(--accent-text)]">
                      {pilar.titulo}
                    </h3>
                    <p className="text-secondary mt-1.5 text-[0.875rem] leading-relaxed">
                      {pilar.texto}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ================================================================ */}
        {/* CTA PRESTADOR                                                    */}
        {/* ================================================================ */}
        <section className="mt-13">
          <Card
            className="p-8 sm:p-12"
            style={{
              background: "linear-gradient(150deg,var(--accent-soft),var(--surface-card))",
            }}
          >
            <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl min-w-0">
                <h2 className="text-[clamp(24px,3vw,34px)] leading-tight font-extrabold tracking-[-0.04em] text-balance">
                  É técnico de climatização? Receba solicitações da sua região.
                </h2>
                <p className="text-secondary mt-3 leading-relaxed text-pretty">
                  Cadastro gratuito. Você define sua área de atendimento e seus preços de
                  referência. A comissão incide somente sobre serviços concluídos.
                </p>
              </div>
              <ButtonLink href="/seja-prestador" size="lg" className="shrink-0">
                Começar cadastro
              </ButtonLink>
            </div>
          </Card>
        </section>

        {/* ================================================================ */}
        {/* CIDADES (SEO)                                                    */}
        {/* ================================================================ */}
        <section className="mt-13">
          <h2 className="eyebrow">Cidades atendidas</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {cidades.map((cidade) => (
              <li key={cidade.id}>
                <Link
                  href={`/tecnicos/${cidade.slug}`}
                  className="surface-card inline-block rounded-(--radius-pill) px-4 py-2 text-[0.8125rem] transition-colors hover:border-[var(--accent)]"
                >
                  Ar-condicionado em {cidade.name}
                  <span className="text-muted"> · {cidade.state}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ================================================================ */}
        {/* FAQ                                                              */}
        {/* ================================================================ */}
        <section className="mt-13">
          <div className="text-center">
            <p className="eyebrow">Dúvidas</p>
            <h2 className="mt-2 text-[clamp(28px,4vw,40px)] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance">
              Perguntas frequentes
            </h2>
          </div>
          <div className="mt-8">
            <Faq itens={FAQ} />
          </div>
        </section>
      </main>

      <SiteFooter categorias={categorias} cidades={cidades} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                name: "AirFlow",
                description: "Marketplace de serviços de ar-condicionado e climatização.",
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

function Stat({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="min-w-0">
      <dd className="num text-[2.5rem] leading-none font-extrabold text-[var(--accent-text)]">
        {valor}
      </dd>
      <dt className="text-muted mt-2 text-[0.78125rem]">{rotulo}</dt>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  titulo,
  descricao,
}: {
  eyebrow: string;
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="max-w-2xl min-w-0">
      <p className="eyebrow text-[var(--accent-text)]">{eyebrow}</p>
      <h2 className="mt-2.5 text-[clamp(28px,4vw,40px)] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance">
        {titulo}
      </h2>
      <p className="text-secondary mt-3 leading-relaxed text-pretty">{descricao}</p>
    </div>
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
    <footer className="bg-[var(--surface-card)] mt-16 border-t py-14">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid gap-10 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <div className="min-w-0">
            <p className="text-lg font-extrabold tracking-[-0.02em]">AirFlow</p>
            <p className="text-secondary mt-2 text-sm leading-relaxed">
              Marketplace de serviços de ar-condicionado e climatização com pagamento
              protegido.
            </p>
          </div>

          <nav aria-labelledby="footer-servicos" className="min-w-0">
            <h2 id="footer-servicos" className="eyebrow">
              Serviços
            </h2>
            <ul className="mt-3.5 flex flex-col gap-2 text-sm">
              {categorias.slice(0, 6).map((categoria) => (
                <li key={categoria.id}>
                  <Link
                    href={`/servicos/${categoria.slug}`}
                    className="text-secondary transition-colors hover:text-[var(--accent-text)]"
                  >
                    {categoria.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-cidades" className="min-w-0">
            <h2 id="footer-cidades" className="eyebrow">
              Cidades
            </h2>
            <ul className="mt-3.5 flex flex-col gap-2 text-sm">
              {cidades.slice(0, 6).map((cidade) => (
                <li key={cidade.id}>
                  <Link
                    href={`/tecnicos/${cidade.slug}`}
                    className="text-secondary transition-colors hover:text-[var(--accent-text)]"
                  >
                    {cidade.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-institucional" className="min-w-0">
            <h2 id="footer-institucional" className="eyebrow">
              Institucional
            </h2>
            <ul className="mt-3.5 flex flex-col gap-2 text-sm">
              {[
                ["/como-funciona", "Como funciona"],
                ["/seguranca", "Segurança"],
                ["/seja-prestador", "Seja prestador"],
                ["/termos", "Termos de uso"],
                ["/privacidade", "Política de privacidade"],
              ].map(([href, rotulo]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-secondary transition-colors hover:text-[var(--accent-text)]"
                  >
                    {rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="text-muted mt-10 border-t pt-6 text-xs">
          © {new Date().getFullYear()} AirFlow. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
