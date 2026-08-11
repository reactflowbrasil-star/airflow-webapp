/**
 * Busca por intenção (§11) e geolocalização (§45).
 *
 * Domínio puro: o cliente digita "meu ar não está gelando" e precisamos
 * chegar em "Manutenção corretiva" sem depender de correspondência textual
 * exata. A implementação atual pontua por palavras-chave de intenção
 * cadastradas na categoria; a interface foi mantida estreita para permitir
 * trocar por embeddings depois sem tocar nos chamadores.
 */

export interface CategoriaBuscavel {
  id: string;
  slug: string;
  name: string;
  intentKeywords: string[];
}

export interface CategoriaPontuada {
  categoria: CategoriaBuscavel;
  score: number;
}

/** Remove acentos e caixa para comparar "não gela" com "nao Gela". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PALAVRAS_IGNORADAS = new Set([
  "de", "do", "da", "o", "a", "os", "as", "e", "em", "no", "na", "um", "uma",
  "meu", "minha", "esta", "está", "nao", "não", "com", "para", "por", "que",
]);

function tokens(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !PALAVRAS_IGNORADAS.has(t));
}

/**
 * Pontua categorias contra a consulta do usuário.
 *
 * Uma keyword multi-palavra encontrada inteira na frase vale muito mais que
 * tokens soltos: "não gela" casando literal é sinal forte de corretiva,
 * enquanto "ar" sozinho não diz nada.
 */
export function pontuarCategorias(
  consulta: string,
  categorias: readonly CategoriaBuscavel[],
): CategoriaPontuada[] {
  const frase = normalizar(consulta);
  if (frase === "") return [];

  const tokensConsulta = new Set(tokens(consulta));

  const pontuadas = categorias.map((categoria) => {
    let score = 0;

    // Nome da categoria citado diretamente
    if (frase.includes(normalizar(categoria.name))) score += 10;

    for (const keyword of categoria.intentKeywords) {
      const alvo = normalizar(keyword);
      if (alvo === "") continue;

      if (alvo.includes(" ")) {
        // Expressão completa: sinal forte
        if (frase.includes(alvo)) score += 8;
      } else if (tokensConsulta.has(alvo)) {
        score += 3;
      }
    }

    // Token da consulta aparecendo no nome da categoria
    for (const token of tokensConsulta) {
      if (normalizar(categoria.name).includes(token)) score += 2;
    }

    return { categoria, score };
  });

  return pontuadas
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.categoria.slug.localeCompare(b.categoria.slug));
}

/** Distância aproximada em km entre dois pontos (Haversine). */
export function distanciaKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Arredonda a distância antes de exibir (§45).
 *
 * Mostrar "4,237 km" permitiria triangular o endereço exato do profissional
 * a partir de algumas consultas. Arredondamos para faixas.
 */
export function distanciaAproximada(km: number): number {
  if (km < 1) return 1;
  if (km < 10) return Math.round(km * 2) / 2; // meio em meio km
  return Math.round(km);
}

/**
 * Ranking de recomendação (§10).
 *
 * Combina reputação e proximidade. Sem isso, "recomendados" viraria ordem
 * de cadastro, e os primeiros técnicos a entrar dominariam a plataforma
 * para sempre.
 */
export interface PrestadorRankeavel {
  id: string;
  reputationScore: number;
  ratingAverage: number;
  completedServices: number;
  distanciaKm: number | null;
  avgResponseMinutes: number | null;
  verified: boolean;
}

export function pontuarRecomendacao(prestador: PrestadorRankeavel): number {
  let score = prestador.reputationScore * 10;

  if (prestador.distanciaKm !== null) {
    // Decai suavemente com a distância: 0 km = +20, 20 km ≈ +6,7
    score += 20 / (1 + prestador.distanciaKm / 10);
  }
  if (prestador.verified) score += 5;

  // Resposta rápida importa, com teto para não dominar o ranking
  if (prestador.avgResponseMinutes !== null) {
    score += Math.min(5, 300 / (prestador.avgResponseMinutes + 30));
  }

  // Volume conta em escala logarítmica: dobrar serviços não dobra o peso
  score += Math.log10(prestador.completedServices + 1) * 3;

  return score;
}
