import { describe, expect, it } from "vitest";

import {
  bboxParaEmbed,
  coordsOk,
  googleMapsDirectionsUrl,
  googleMapsSearchUrl,
  osmEmbedUrl,
  wazeNavigationUrl,
} from "@/lib/service-map";

describe("service-map", () => {
  it("coordsOk aceita coordenadas válidas", () => {
    expect(coordsOk(-23.55, -46.63)).toBe(true);
  });

  it("coordsOk recusa null, undefined e fora do domínio", () => {
    expect(coordsOk(null, -46.63)).toBe(false);
    expect(coordsOk(-23.55, undefined)).toBe(false);
    expect(coordsOk(91, 0)).toBe(false);
    expect(coordsOk(0, 181)).toBe(false);
    expect(coordsOk(Number.NaN, 0)).toBe(false);
  });

  it("bboxParaEmbed centraliza a caixa no ponto com margem fixa", () => {
    const [minLon, minLat, maxLon, maxLat] = bboxParaEmbed({
      latitude: -23.55,
      longitude: -46.63,
    }).split(",").map(Number);
    expect(minLat).toBeCloseTo(-23.5525, 4);
    expect(maxLat).toBeCloseTo(-23.5475, 4);
    expect(minLon).toBeCloseTo(-46.6325, 4);
    expect(maxLon).toBeCloseTo(-46.6275, 4);
  });

  it("osmEmbedUrl aponta o marker para as coordenadas", () => {
    const url = osmEmbedUrl({ latitude: -23.55, longitude: -46.63 });
    expect(url).toContain("openstreetmap.org/export/embed.html");
    expect(url).toContain("marker=-23.55,-46.63");
  });

  it("googleMapsDirectionsUrl usa origem quando informada", () => {
    const url = googleMapsDirectionsUrl(
      { latitude: -23.55, longitude: -46.63 },
      { latitude: -23.61, longitude: -46.7 },
    );
    expect(url).toContain("origin=-23.610000,-46.700000");
    expect(url).toContain("destination=-23.550000,-46.630000");
    expect(url).toContain("travelmode=driving");
  });

  it("googleMapsDirectionsUrl sem origem usa a localização atual", () => {
    const url = googleMapsDirectionsUrl({ latitude: -23.55, longitude: -46.63 });
    expect(url).not.toContain("origin=");
    expect(url).toContain("destination=-23.550000,-46.630000");
  });

  it("wazeNavigationUrl navega até o ponto", () => {
    expect(wazeNavigationUrl({ latitude: -23.55, longitude: -46.63 })).toBe(
      "https://www.waze.com/ul?ll=-23.550000,-46.630000&navigate=yes",
    );
  });

  it("googleMapsSearchUrl codifica o endereço texto", () => {
    const url = googleMapsSearchUrl("Av. Paulista, 1000 – São Paulo");
    expect(url).toContain("query=Av.%20Paulista");
    expect(url).toContain("%20");
  });
});
