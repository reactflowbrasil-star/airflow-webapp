import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import {
  addPortfolioItem,
  removePortfolioItem,
  removeProviderService,
  saveProviderService,
  setProviderServiceActive,
} from "@/server/services/provider-catalog-service";
import { criarCenarioBase, resetDatabase, type Cenario } from "./helpers";

let cenario: Cenario;

beforeEach(async () => {
  await resetDatabase();
  cenario = await criarCenarioBase();
});

afterAll(async () => prisma.$disconnect());

describe("catálogo do prestador", () => {
  it("cadastra preço em centavos, pausa e remove sem apagar histórico", async () => {
    const service = await saveProviderService(cenario.providerProfileId, {
      categoryId: cenario.categoryId,
      fromPriceCents: 18990,
      description: "Higienização completa",
    });
    expect(service.fromPriceCents).toBe(18990);
    expect(service.active).toBe(true);

    expect(
      await setProviderServiceActive(cenario.providerProfileId, service.id, false),
    ).toBe(true);
    expect(
      (await prisma.providerService.findUniqueOrThrow({ where: { id: service.id } }))
        .active,
    ).toBe(false);

    expect(await removeProviderService(cenario.providerProfileId, service.id)).toBe(true);
    const removed = await prisma.providerService.findUniqueOrThrow({
      where: { id: service.id },
    });
    expect(removed.deletedAt).not.toBeNull();
    expect(removed.active).toBe(false);
  });

  it("não altera serviço pertencente a outro prestador", async () => {
    const service = await saveProviderService(cenario.providerProfileId, {
      categoryId: cenario.categoryId,
      fromPriceCents: 15000,
    });

    expect(await removeProviderService("prestador-alheio", service.id)).toBe(false);
    expect(
      (await prisma.providerService.findUniqueOrThrow({ where: { id: service.id } }))
        .deletedAt,
    ).toBeNull();
  });

  it("adiciona portfólio ordenado e faz remoção lógica com ownership", async () => {
    const first = await addPortfolioItem(cenario.providerProfileId, {
      title: "Instalação residencial",
      imageUrl: "https://imagens.teste.local/instalacao.jpg",
    });
    const second = await addPortfolioItem(cenario.providerProfileId, {
      title: "Manutenção comercial",
      imageUrl: "https://imagens.teste.local/manutencao.jpg",
    });
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);

    expect(await removePortfolioItem("prestador-alheio", first.id)).toBe(false);
    expect(await removePortfolioItem(cenario.providerProfileId, first.id)).toBe(true);
    expect(
      (await prisma.portfolioItem.findUniqueOrThrow({ where: { id: first.id } }))
        .deletedAt,
    ).not.toBeNull();
  });
});
