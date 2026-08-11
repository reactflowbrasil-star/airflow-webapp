import type { MetadataRoute } from "next";

import { prisma } from "@/server/db/prisma";
import { consultaTolerante } from "@/server/db/prerender";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://airflow.com.br";

export const revalidate = 3600;

/**
 * Sitemap dinâmico (§50).
 * Landings de cidade só entram quando há prestador aprovado atendendo ali —
 * evita indexar página vazia (thin content).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Sem banco no build, sai só a parte estática e o `revalidate` completa
  // depois — melhor um sitemap parcial por uma hora do que deploy falhado.
  const [categorias, cidadesComPrestador, tecnicos] = await Promise.all([
    consultaTolerante(
      "sitemap:categorias",
      () =>
        prisma.serviceCategory.findMany({
          where: { active: true },
          select: { slug: true, updatedAt: true },
        }),
      [],
    ),
    consultaTolerante(
      "sitemap:cidades",
      () =>
        prisma.city.findMany({
          where: {
            active: true,
            providers: { some: { status: "APROVADO", deletedAt: null } },
          },
          select: { slug: true, updatedAt: true },
        }),
      [],
    ),
    consultaTolerante(
      "sitemap:tecnicos",
      () =>
        prisma.providerProfile.findMany({
          where: { status: "APROVADO", deletedAt: null },
          select: { slug: true, updatedAt: true },
        }),
      [],
    ),
  ]);

  const estaticas: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/tecnicos`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/servicos`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/como-funciona`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/seguranca`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/seja-prestador`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/termos`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: "yearly", priority: 0.3 },
  ];

  return [
    ...estaticas,
    ...categorias.map((c) => ({
      url: `${SITE_URL}/servicos/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...cidadesComPrestador.map((c) => ({
      url: `${SITE_URL}/tecnicos/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...tecnicos.map((t) => ({
      url: `${SITE_URL}/tecnico/${t.slug}`,
      lastModified: t.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
