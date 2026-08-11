import { DomainError } from "@/domain/shared/errors";
import { prisma } from "@/server/db/prisma";

export interface ProviderServiceInput {
  categoryId: string;
  fromPriceCents: number;
  description?: string;
}

export async function saveProviderService(
  providerId: string,
  input: ProviderServiceInput,
) {
  const category = await prisma.serviceCategory.findFirst({
    where: { id: input.categoryId, active: true },
    select: { id: true },
  });
  if (!category) {
    throw new DomainError("CATEGORY_NOT_AVAILABLE", "Categoria indisponível");
  }

  return prisma.providerService.upsert({
    where: {
      providerId_categoryId: { providerId, categoryId: input.categoryId },
    },
    create: { providerId, ...input, description: input.description?.trim() || null },
    update: {
      fromPriceCents: input.fromPriceCents,
      description: input.description?.trim() || null,
      active: true,
      deletedAt: null,
    },
  });
}

export async function setProviderServiceActive(
  providerId: string,
  serviceId: string,
  active: boolean,
) {
  const result = await prisma.providerService.updateMany({
    where: { id: serviceId, providerId, deletedAt: null },
    data: { active },
  });
  return result.count > 0;
}

export async function removeProviderService(providerId: string, serviceId: string) {
  const result = await prisma.providerService.updateMany({
    where: { id: serviceId, providerId, deletedAt: null },
    data: { active: false, deletedAt: new Date() },
  });
  return result.count > 0;
}

export interface PortfolioInput {
  title: string;
  description?: string;
  imageUrl: string;
}

export async function addPortfolioItem(providerId: string, input: PortfolioInput) {
  const last = await prisma.portfolioItem.findFirst({
    where: { providerId, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return prisma.portfolioItem.create({
    data: {
      providerId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      imageUrl: input.imageUrl,
      position: (last?.position ?? -1) + 1,
    },
  });
}

export async function removePortfolioItem(providerId: string, itemId: string) {
  const result = await prisma.portfolioItem.updateMany({
    where: { id: itemId, providerId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}
