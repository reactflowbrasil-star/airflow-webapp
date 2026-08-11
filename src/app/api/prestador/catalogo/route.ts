import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import {
  addPortfolioItem,
  removePortfolioItem,
  removeProviderService,
  saveProviderService,
  setProviderServiceActive,
} from "@/server/services/provider-catalog-service";

const priceSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  const normalized = String(value).replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(normalized);
  if (!match) {
    ctx.addIssue({ code: "custom", message: "Preço inválido" });
    return z.NEVER;
  }
  return Number.parseInt(match[1], 10) * 100 + Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10);
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SAVE_SERVICE"),
    categoryId: z.string().min(1),
    fromPriceCents: priceSchema,
    description: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal("SET_SERVICE_ACTIVE"), serviceId: z.string().min(1), active: z.boolean() }),
  z.object({ action: z.literal("REMOVE_SERVICE"), serviceId: z.string().min(1) }),
  z.object({
    action: z.literal("ADD_PORTFOLIO"),
    title: z.string().trim().min(3).max(120),
    description: z.string().max(500).optional(),
    imageUrl: z.string().url().refine((value) => value.startsWith("https://"), "Use uma imagem HTTPS"),
  }),
  z.object({ action: z.literal("REMOVE_PORTFOLIO"), itemId: z.string().min(1) }),
]);

export const POST = withApiHandler<[Request]>(async (_ctx, request) => {
  const session = await requireProvider();
  const body = await parseJsonBody(request, bodySchema);

  switch (body.action) {
    case "SAVE_SERVICE": {
      const service = await saveProviderService(session.providerProfileId, {
        categoryId: body.categoryId,
        fromPriceCents: body.fromPriceCents,
        description: body.description,
      });
      return NextResponse.json({ service }, { status: 201 });
    }
    case "SET_SERVICE_ACTIVE": {
      const found = await setProviderServiceActive(session.providerProfileId, body.serviceId, body.active);
      return found ? NextResponse.json({ active: body.active }) : apiError(404, "NOT_FOUND", "Serviço não encontrado");
    }
    case "REMOVE_SERVICE": {
      const found = await removeProviderService(session.providerProfileId, body.serviceId);
      return found ? NextResponse.json({ removed: true }) : apiError(404, "NOT_FOUND", "Serviço não encontrado");
    }
    case "ADD_PORTFOLIO": {
      const item = await addPortfolioItem(session.providerProfileId, body);
      return NextResponse.json({ item }, { status: 201 });
    }
    case "REMOVE_PORTFOLIO": {
      const found = await removePortfolioItem(session.providerProfileId, body.itemId);
      return found ? NextResponse.json({ removed: true }) : apiError(404, "NOT_FOUND", "Item não encontrado");
    }
  }
});
