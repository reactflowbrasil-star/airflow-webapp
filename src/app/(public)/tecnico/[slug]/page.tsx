import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { Badge, ButtonLink, Card, Rating } from "@/ui";

interface Props {
  params: Promise<{ slug: string }>;
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatarHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function carregarTecnico(slug: string) {
  return prisma.providerProfile.findFirst({
    where: { slug, status: "APROVADO", deletedAt: null },
    include: {
      city: true,
      services: {
        where: { active: true, deletedAt: null },
        orderBy: { fromPriceCents: "asc" },
        include: { category: true },
      },
      portfolio: { where: { deletedAt: null }, orderBy: { position: "asc" }, take: 8 },
      availability: { where: { active: true }, orderBy: { weekday: "asc" } },
      reviews: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { customer: { include: { user: { select: { name: true } } } } },
      },
      documents: {
        where: { type: "CERTIFICADO_TECNICO", status: "APROVADO" },
        select: { id: true, fileName: true },
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tecnico = await carregarTecnico(slug);
  if (!tecnico) return { title: "Técnico não encontrado" };

  const local = [tecnico.neighborhood, tecnico.city?.name].filter(Boolean).join(", ");
  return {
    title: `${tecnico.displayName} — Técnico de ar-condicionado${local ? ` em ${local}` : ""}`,
    description:
      tecnico.bio?.slice(0, 160) ??
      `Contrate ${tecnico.displayName} para serviços de climatização. Negocie o valor e pague com segurança pela AirFlow.`,
    alternates: { canonical: `/tecnico/${tecnico.slug}` },
    openGraph: { type: "profile", title: tecnico.displayName },
  };
}

export default async function PerfilTecnicoPage({ params }: Props) {
  const { slug } = await params;
  const tecnico = await carregarTecnico(slug);
  if (!tecnico) notFound();

  const local = [tecnico.neighborhood, tecnico.city?.name].filter(Boolean).join(", ");
  const menorPreco = tecnico.services[0]?.fromPriceCents ?? null;

  return (
    <>
      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <nav aria-label="Trilha" className="text-muted mb-5 text-sm">
          <Link href="/tecnicos" className="hover:underline">
            Técnicos
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{tecnico.displayName}</span>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-6">
            {/* Identificação */}
            <Card className="p-6 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="bg-grad grid h-[88px] w-[88px] shrink-0 place-items-center rounded-[24px] text-3xl font-extrabold text-white">
                    {tecnico.displayName.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                  <h1 className="text-[clamp(24px,3.4vw,38px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
                    {tecnico.displayName}
                  </h1>
                  {/* Nunca o endereço exato — só região (§9) */}
                  <p className="text-secondary mt-1">
                    {local || "Região não informada"}
                    {tecnico.serviceRadiusKm && (
                      <span className="text-muted">
                        {" "}
                        · atende até {tecnico.serviceRadiusKm} km
                      </span>
                    )}
                  </p>
                  </div>
                </div>
                {tecnico.verified && <Badge tone="success">Perfil verificado</Badge>}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metrica rotulo="Avaliação">
                  {tecnico.ratingCount > 0 ? (
                    <Rating value={tecnico.ratingAverage} count={tecnico.ratingCount} />
                  ) : (
                    <span className="text-muted text-sm">Sem avaliações</span>
                  )}
                </Metrica>
                <Metrica rotulo="Serviços concluídos">
                  <span className="font-semibold">{tecnico.completedServices}</span>
                </Metrica>
                {tecnico.yearsOfExperience !== null && (
                  <Metrica rotulo="Experiência">
                    <span className="font-semibold">{tecnico.yearsOfExperience} anos</span>
                  </Metrica>
                )}
                {tecnico.avgResponseMinutes !== null && (
                  <Metrica rotulo="Responde em">
                    <span className="font-semibold">~{tecnico.avgResponseMinutes} min</span>
                  </Metrica>
                )}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {tecnico.acceptsResidential && <Badge tone="brand">Residencial</Badge>}
                {tecnico.acceptsCommercial && <Badge tone="brand">Comercial</Badge>}
                {tecnico.acceptsEmergency && <Badge tone="warning">Emergência</Badge>}
              </div>

              {tecnico.bio && (
                <p className="text-secondary mt-5 leading-relaxed">{tecnico.bio}</p>
              )}
            </Card>

            {/* Serviços */}
            <section>
              <h2 className="text-lg font-bold tracking-[-0.02em]">Serviços oferecidos</h2>
              {tecnico.services.length === 0 ? (
                <p className="text-muted mt-2 text-sm">
                  Este profissional ainda não cadastrou serviços com preço de referência.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {tecnico.services.map((servico) => (
                    <li key={servico.id}>
                      <Card className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <h3 className="font-medium">{servico.category.name}</h3>
                          {servico.description && (
                            <p className="text-secondary mt-0.5 text-sm">
                              {servico.description}
                            </p>
                          )}
                        </div>
                        <p className="text-muted shrink-0 text-right text-xs">
                          a partir de
                          <br />
                          <span className="num text-base font-bold text-[var(--accent-text)]">
                            {formatBRL(money(servico.fromPriceCents))}
                          </span>
                        </p>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Portfólio */}
            {tecnico.portfolio.length > 0 && (
              <section>
                <h2 className="text-lg font-bold tracking-[-0.02em]">Portfólio</h2>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {tecnico.portfolio.map((item) => (
                    <li key={item.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="aspect-square w-full rounded-(--radius-field) object-cover"
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Disponibilidade */}
            {tecnico.availability.length > 0 && (
              <section>
                <h2 className="text-lg font-bold tracking-[-0.02em]">Disponibilidade</h2>
                <ul className="text-secondary mt-3 flex flex-wrap gap-2 text-sm">
                  {tecnico.availability.map((janela) => (
                    <li
                      key={janela.id}
                      className="surface-card num rounded-(--radius-pill) px-3.5 py-1.5"
                    >
                      {DIAS[janela.weekday]} · {formatarHora(janela.startMinute)}–
                      {formatarHora(janela.endMinute)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Avaliações */}
            <section>
              <h2 className="text-lg font-bold tracking-[-0.02em]">
                Avaliações {tecnico.ratingCount > 0 && `(${tecnico.ratingCount})`}
              </h2>
              {tecnico.reviews.length === 0 ? (
                <p className="text-muted mt-2 text-sm">
                  Este profissional ainda não recebeu avaliações. Só quem contratou pelo
                  AirFlow pode avaliar.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {tecnico.reviews.map((review) => (
                    <li key={review.id}>
                      <Card className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{review.customer.user.name}</p>
                          <Rating value={review.rating} />
                        </div>
                        {review.comment && (
                          <p className="text-secondary mt-2 text-sm leading-relaxed">
                            {review.comment}
                          </p>
                        )}
                        <time
                          dateTime={review.createdAt.toISOString()}
                          className="text-muted mt-2 block text-xs"
                        >
                          {review.createdAt.toLocaleDateString("pt-BR")}
                        </time>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* CTA fixo (§9) */}
          <aside className="lg:sticky lg:top-[90px] lg:self-start">
            <Card className="p-5">
              {menorPreco !== null && (
                <p className="text-muted text-sm">
                  Serviços a partir de{" "}
                  <span className="num text-lg font-extrabold text-[var(--accent-text)]">
                    {formatBRL(money(menorPreco))}
                  </span>
                </p>
              )}
              <ButtonLink
                href={`/app/solicitar?tecnico=${tecnico.slug}`}
                size="lg"
                fullWidth
                className="anim-pulse-ring relative mt-4"
              >
                Pedir orçamento
              </ButtonLink>
              <p className="text-muted mt-3 text-center text-xs leading-relaxed">
                Você descreve o problema, propõe um valor e negocia direto com o
                técnico. O pagamento só é liberado após o serviço concluído.
              </p>
            </Card>
          </aside>
        </div>
      </main>

      {/* Structured data (§50) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: tecnico.displayName,
            description: tecnico.bio ?? undefined,
            areaServed: tecnico.city?.name,
            ...(tecnico.ratingCount > 0
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: tecnico.ratingAverage.toFixed(1),
                    reviewCount: tecnico.ratingCount,
                  },
                }
              : {}),
            ...(menorPreco !== null
              ? {
                  makesOffer: tecnico.services.map((s) => ({
                    "@type": "Offer",
                    itemOffered: { "@type": "Service", name: s.category.name },
                    price: (s.fromPriceCents / 100).toFixed(2),
                    priceCurrency: "BRL",
                  })),
                }
              : {}),
          }),
        }}
      />
    </>
  );
}

function Metrica({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="eyebrow">{rotulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
