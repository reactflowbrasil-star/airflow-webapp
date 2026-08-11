import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireAdmin } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";

/**
 * Configuração administrativa de comissão (§20) — nada hardcoded.
 * Regras nunca são editadas em vigor: cria-se nova versão e desativa-se a
 * anterior, preservando os snapshots das ordens antigas (§19).
 */

const criarRegraSchema = z.object({
  name: z.string().min(3).max(120),
  scope: z.enum(["PROVIDER", "PROMOTIONAL", "CAMPAIGN", "CITY", "CATEGORY", "PLAN", "GLOBAL"]),
  percentBps: z.number().int().min(0).max(10000),
  fixedFeeCents: z.number().int().min(0).default(0),
  minCommissionCents: z.number().int().positive().nullish(),
  maxCommissionCents: z.number().int().positive().nullish(),
  providerId: z.string().nullish(),
  categoryId: z.string().nullish(),
  cityId: z.string().nullish(),
  planCode: z.string().nullish(),
  campaignCode: z.string().nullish(),
  priority: z.number().int().default(0),
  /** Id de regra a desativar atomicamente ao criar esta (troca de versão). */
  replacesRuleId: z.string().nullish(),
});

export const GET = withApiHandler(async () => {
  await requireAdmin();
  const regras = await prisma.commissionRule.findMany({
    orderBy: [{ active: "desc" }, { scope: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ rules: regras });
});

export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireAdmin();
  const input = await parseJsonBody(request, criarRegraSchema);

  const regra = await prisma.$transaction(async (tx) => {
    let version = 1;
    if (input.replacesRuleId) {
      const anterior = await tx.commissionRule.update({
        where: { id: input.replacesRuleId },
        data: { active: false, validTo: new Date() },
      });
      version = anterior.version + 1;
    }
    const criada = await tx.commissionRule.create({
      data: {
        name: input.name,
        scope: input.scope,
        percentBps: input.percentBps,
        fixedFeeCents: input.fixedFeeCents,
        minCommissionCents: input.minCommissionCents ?? null,
        maxCommissionCents: input.maxCommissionCents ?? null,
        providerId: input.providerId ?? null,
        categoryId: input.categoryId ?? null,
        cityId: input.cityId ?? null,
        planCode: input.planCode ?? null,
        campaignCode: input.campaignCode ?? null,
        priority: input.priority,
        version,
        createdBy: session.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: "COMMISSION_RULE_CREATED",
        entityType: "CommissionRule",
        entityId: criada.id,
        previousValue: input.replacesRuleId ? { replaced: input.replacesRuleId } : undefined,
        newValue: { scope: input.scope, percentBps: input.percentBps, version },
        correlationId,
      },
    });
    return criada;
  });

  return NextResponse.json({ rule: regra }, { status: 201 });
});
