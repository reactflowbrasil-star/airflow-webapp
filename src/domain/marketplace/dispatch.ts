export interface DispatchProviderCandidate {
  providerId: string;
  distanceKm: number | null;
  reputationScore: number;
  avgResponseMinutes: number | null;
}

export interface RankedDispatchCandidate extends DispatchProviderCandidate {
  queuePosition: number;
}

/**
 * Fila de alerta (§13): proximidade decide primeiro, reputação desempata e
 * tempo médio de resposta evita deixar técnicos lentos sempre na frente.
 */
export function rankDispatchCandidates(
  candidates: DispatchProviderCandidate[],
): RankedDispatchCandidate[] {
  return [...candidates]
    .sort((a, b) => {
      const distanciaA = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const distanciaB = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (distanciaA !== distanciaB) return distanciaA - distanciaB;

      if (a.reputationScore !== b.reputationScore) {
        return b.reputationScore - a.reputationScore;
      }

      const respostaA = a.avgResponseMinutes ?? Number.POSITIVE_INFINITY;
      const respostaB = b.avgResponseMinutes ?? Number.POSITIVE_INFINITY;
      if (respostaA !== respostaB) return respostaA - respostaB;

      return a.providerId.localeCompare(b.providerId);
    })
    .map((candidate, index) => ({ ...candidate, queuePosition: index + 1 }));
}

export function rotateCandidateToEnd(
  candidates: RankedDispatchCandidate[],
  providerId: string,
): RankedDispatchCandidate[] {
  const current = candidates.find((candidate) => candidate.providerId === providerId);
  if (!current) return candidates;

  return [
    ...candidates.filter((candidate) => candidate.providerId !== providerId),
    current,
  ].map((candidate, index) => ({ ...candidate, queuePosition: index + 1 }));
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
