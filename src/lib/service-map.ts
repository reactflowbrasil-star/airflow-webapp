/**
 * URLs de mapa e direção — puras, sem I/O, testáveis sem banco.
 *
 * O mapa do prestador mostra o endereço do cliente (coordenadas da
 * solicitação) e abre a navegação guiada de onde o prestador está
 * (baseLatitude/baseLongitude) até lá. As coordenadas vêm do Address da
 * solicitação — mesmo dado usado pelo dispatch para ranquear por distância.
 */

export interface Coordenadas {
  latitude: number;
  longitude: number;
}

export function coordsOk(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/**
 * Valida e devolve as coordenadas tipadas (ou null). O cast em longitude é
 * deliberado: o predicado de tipo do TypeScript só expressa um parâmetro,
 * mas a checagem de `coordsOk` cobre os dois em tempo de execução.
 */
export function paraCoordenadas(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Coordenadas | null {
  return coordsOk(latitude, longitude)
    ? { latitude, longitude: longitude as number }
    : null;
}

const MEIA_CAIXA = 0.0025;

/** Bbox ao redor do ponto, para o iframe de embed do OpenStreetMap. */
export function bboxParaEmbed(ponto: Coordenadas): string {
  return [
    ponto.longitude - MEIA_CAIXA,
    ponto.latitude - MEIA_CAIXA,
    ponto.longitude + MEIA_CAIXA,
    ponto.latitude + MEIA_CAIXA,
  ].join(",");
}

export function osmEmbedUrl(ponto: Coordenadas): string {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bboxParaEmbed(ponto)}&layer=mapnik&marker=${ponto.latitude},${ponto.longitude}`;
}

function formatar(ponto: Coordenadas): string {
  return `${ponto.latitude.toFixed(6)},${ponto.longitude.toFixed(6)}`;
}

/**
 * Direção guiada no Google Maps, do ponto de origem (base do prestador) até
 * o cliente. Sem origem, o Google assume a localização atual do aparelho.
 */
export function googleMapsDirectionsUrl(
  destino: Coordenadas,
  origem?: Coordenadas,
): string {
  const base = "https://www.google.com/maps/dir/?api=1&travelmode=driving";
  if (origem) return `${base}&origin=${formatar(origem)}&destination=${formatar(destino)}`;
  return `${base}&destination=${formatar(destino)}`;
}

/** Waze usa a localização atual do aparelho para navegar até o ponto. */
export function wazeNavigationUrl(destino: Coordenadas): string {
  return `https://www.waze.com/ul?ll=${formatar(destino)}&navigate=yes`;
}

/** Busca por endereço texto quando não há coordenadas (fallback honesto). */
export function googleMapsSearchUrl(endereco: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}
