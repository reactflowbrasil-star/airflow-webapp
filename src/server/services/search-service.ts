/**
 * Busca de prestadores (§10, §11, §45).
 *
 * Filtra no banco e ordena no domínio. A localização exata do prestador nunca
 * sai daqui — só a distância arredondada (§9, §45).
 */

import {
  distanciaAproximada,
  distanciaKm,
  posicaoMapaPublica,
  pontuarCategorias,
  pontuarRecomendacao,
} from "@/domain/marketplace/search";
import { prisma } from "@/server/db/prisma";
import type { SearchProvidersInput } from "@/lib/validation/marketplace";

const POR_PAGINA = 12;

export interface PrestadorResultado {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  verified: boolean;
  cidade: string | null;
  bairro: string | null;
  /** Já arredondada — nunca a distância exata. */
  distanciaKm: number | null;
  ratingAverage: number;
  ratingCount: number;
  completedServices: number;
  yearsOfExperience: number | null;
  avgResponseMinutes: number | null;
  aPartirDeCents: number | null;
  servicos: string[];
  /** Posição visual não geográfica; nunca contém latitude/longitude da base. */
  posicaoMapa: { x: number; y: number };
}

export interface ResultadoBusca {
  prestadores: PrestadorResultado[];
  total: number;
  pagina: number;
  totalPaginas: number;
  /** Categoria inferida da frase digitada, quando houver (§11). */
  categoriaInferida: { slug: string; name: string } | null;
}

export async function buscarPrestadores(
  filtros: SearchProvidersInput,
): Promise<ResultadoBusca> {
  // 1. Intenção → categoria (§11)
  let categoriaSlug = filtros.categoria;
  let categoriaInferida: { slug: string; name: string } | null = null;

  if (!categoriaSlug && filtros.q) {
    const categorias = await prisma.serviceCategory.findMany({
      where: { active: true },
      select: { id: true, slug: true, name: true, intentKeywords: true },
    });
    const [melhor] = pontuarCategorias(filtros.q, categorias);
    if (melhor) {
      categoriaSlug = melhor.categoria.slug;
      categoriaInferida = { slug: melhor.categoria.slug, name: melhor.categoria.name };
    }
  }

  // 2. Filtros no banco
  const prestadores = await prisma.providerProfile.findMany({
    where: {
      status: "APROVADO",
      deletedAt: null,
      ...(filtros.verificados ? { verified: true } : {}),
      ...(filtros.emergencia ? { acceptsEmergency: true } : {}),
      ...(filtros.comercial ? { acceptsCommercial: true } : {}),
      ...(filtros.notaMin ? { ratingAverage: { gte: filtros.notaMin } } : {}),
      ...(filtros.cidade ? { city: { slug: filtros.cidade } } : {}),
      ...(categoriaSlug
        ? {
            services: {
              some: {
                active: true,
                deletedAt: null,
                category: { slug: categoriaSlug },
                ...(filtros.precoMax
                  ? { fromPriceCents: { lte: filtros.precoMax } }
                  : {}),
              },
            },
          }
        : filtros.precoMax
          ? { services: { some: { active: true, fromPriceCents: { lte: filtros.precoMax } } } }
          : {}),
    },
    include: {
      city: { select: { name: true } },
      services: {
        where: { active: true, deletedAt: null },
        orderBy: { fromPriceCents: "asc" },
        include: { category: { select: { name: true, slug: true } } },
      },
    },
  });

  // 3. Distância e ordenação no domínio
  const origem =
    filtros.lat !== undefined && filtros.lng !== undefined
      ? { lat: filtros.lat, lng: filtros.lng }
      : null;

  const comDistancia = prestadores.map((p) => {
    const bruta =
      origem && p.baseLatitude !== null && p.baseLongitude !== null
        ? distanciaKm(origem, { lat: p.baseLatitude, lng: p.baseLongitude })
        : null;

    return {
      prestador: p,
      distanciaBruta: bruta,
      // Fora do raio de atendimento não é resultado útil
      foraDoRaio: bruta !== null && bruta > p.serviceRadiusKm,
    };
  });

  const elegiveis = comDistancia.filter((c) => !c.foraDoRaio);

  const ordenados = [...elegiveis].sort((a, b) => {
    switch (filtros.ordenar) {
      case "avaliacao":
        return b.prestador.ratingAverage - a.prestador.ratingAverage;
      case "proximos":
        return (a.distanciaBruta ?? Infinity) - (b.distanciaBruta ?? Infinity);
      case "preco":
        return (
          (a.prestador.services[0]?.fromPriceCents ?? Infinity) -
          (b.prestador.services[0]?.fromPriceCents ?? Infinity)
        );
      case "experiencia":
        return (b.prestador.yearsOfExperience ?? 0) - (a.prestador.yearsOfExperience ?? 0);
      case "resposta":
        return (
          (a.prestador.avgResponseMinutes ?? Infinity) -
          (b.prestador.avgResponseMinutes ?? Infinity)
        );
      default:
        return (
          pontuarRecomendacao({
            id: b.prestador.id,
            reputationScore: b.prestador.reputationScore,
            ratingAverage: b.prestador.ratingAverage,
            completedServices: b.prestador.completedServices,
            distanciaKm: b.distanciaBruta,
            avgResponseMinutes: b.prestador.avgResponseMinutes,
            verified: b.prestador.verified,
          }) -
          pontuarRecomendacao({
            id: a.prestador.id,
            reputationScore: a.prestador.reputationScore,
            ratingAverage: a.prestador.ratingAverage,
            completedServices: a.prestador.completedServices,
            distanciaKm: a.distanciaBruta,
            avgResponseMinutes: a.prestador.avgResponseMinutes,
            verified: a.prestador.verified,
          })
        );
    }
  });

  const total = ordenados.length;
  const inicio = (filtros.pagina - 1) * POR_PAGINA;
  const pagina = ordenados.slice(inicio, inicio + POR_PAGINA);

  return {
    prestadores: pagina.map(({ prestador, distanciaBruta }) => ({
      id: prestador.id,
      slug: prestador.slug,
      displayName: prestador.displayName,
      bio: prestador.bio,
      verified: prestador.verified,
      cidade: prestador.city?.name ?? null,
      bairro: prestador.neighborhood,
      distanciaKm: distanciaBruta === null ? null : distanciaAproximada(distanciaBruta),
      ratingAverage: prestador.ratingAverage,
      ratingCount: prestador.ratingCount,
      completedServices: prestador.completedServices,
      yearsOfExperience: prestador.yearsOfExperience,
      avgResponseMinutes: prestador.avgResponseMinutes,
      aPartirDeCents: prestador.services[0]?.fromPriceCents ?? null,
      servicos: prestador.services.map((s) => s.category.name),
      posicaoMapa: posicaoMapaPublica(
        [prestador.city?.name, prestador.neighborhood, prestador.id].filter(Boolean).join("/"),
      ),
    })),
    total,
    pagina: filtros.pagina,
    totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    categoriaInferida,
  };
}
