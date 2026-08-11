import { describe, expect, it } from "vitest";

import {
  distanceKm,
  rankDispatchCandidates,
  rotateCandidateToEnd,
} from "@/domain/marketplace/dispatch";

describe("dispatch de solicitações", () => {
  it("prioriza prestadores mais próximos antes da reputação", () => {
    const ranked = rankDispatchCandidates([
      {
        providerId: "longe-com-score-alto",
        distanceKm: 8,
        reputationScore: 99,
        avgResponseMinutes: 1,
      },
      {
        providerId: "perto",
        distanceKm: 2,
        reputationScore: 10,
        avgResponseMinutes: 20,
      },
    ]);

    expect(ranked.map((candidate) => candidate.providerId)).toEqual([
      "perto",
      "longe-com-score-alto",
    ]);
    expect(ranked.map((candidate) => candidate.queuePosition)).toEqual([1, 2]);
  });

  it("move o prestador liberado para o fim da fila", () => {
    const ranked = rankDispatchCandidates([
      { providerId: "a", distanceKm: 1, reputationScore: 0, avgResponseMinutes: null },
      { providerId: "b", distanceKm: 2, reputationScore: 0, avgResponseMinutes: null },
      { providerId: "c", distanceKm: 3, reputationScore: 0, avgResponseMinutes: null },
    ]);

    const rotated = rotateCandidateToEnd(ranked, "a");

    expect(rotated.map((candidate) => candidate.providerId)).toEqual(["b", "c", "a"]);
    expect(rotated.map((candidate) => candidate.queuePosition)).toEqual([1, 2, 3]);
  });

  it("calcula distância sem depender de I/O", () => {
    const distancia = distanceKm(
      { latitude: -23.5505, longitude: -46.6333 },
      { latitude: -23.5905, longitude: -46.6333 },
    );

    expect(distancia).toBeGreaterThan(4);
    expect(distancia).toBeLessThan(5);
  });
});
