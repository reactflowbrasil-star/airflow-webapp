/**
 * Antifraude mínimo viável: score de risco por sinais objetivos, avaliado no
 * BACK-END antes de operações financeiras de saída. Acima do limiar, a
 * operação é bloqueada para revisão manual (MANUAL_REVIEW) — nunca liberada
 * pelo n8n ou pelo front.
 */

import { DomainError } from "@/domain/shared/errors";
import type { Prisma } from "@/generated/prisma/client";
import { logger } from "@/server/observability/logger";

type Db = Prisma.TransactionClient;

export const RISK_THRESHOLD = 60;

export interface RiskAssessment {
  score: number;
  signals: Record<string, number>;
}

/** Sinais somados; cada um com teto para nenhum dominar sozinho. */
export async function assessPayoutRisk(
  db: Db,
  providerId: string,
  amountCents: number,
): Promise<RiskAssessment> {
  const provider = await db.providerProfile.findUniqueOrThrow({
    where: { id: providerId },
    include: { user: { select: { createdAt: true } } },
  });

  const signals: Record<string, number> = {};
  const ageDays =
    (Date.now() - provider.user.createdAt.getTime()) / (24 * 3_600_000);
  if (ageDays < 7) signals.conta_recente = 30;
  else if (ageDays < 30) signals.conta_recente = 15;

  const disputas = await db.dispute.count({ where: { providerId } });
  if (disputas > 0) signals.disputas = Math.min(disputas * 20, 40);

  const cancelados = await db.marketplaceOrder.count({
    where: { providerId, status: "CANCELADA" },
  });
  if (cancelados > 0) signals.cancelamentos = Math.min(cancelados * 10, 30);

  const chargebacks = await db.chargeback.count({
    where: { order: { providerId } },
  });
  if (chargebacks > 0) signals.chargebacks = Math.min(chargebacks * 30, 60);

  if (amountCents >= 1_000_000) signals.valor_alto = 30;
  else if (amountCents >= 300_000) signals.valor_alto = 15;

  const score = Object.values(signals).reduce((a, b) => a + b, 0);
  return { score, signals };
}

/**
 * Bloqueia o repasse quando o score excede o limiar, com auditoria (§44).
 * A liberação exige ação administrativa — não há caminho automático.
 */
export async function assertPayoutRiskAcceptable(
  db: Db,
  providerId: string,
  amountCents: number,
  correlationId: string,
): Promise<RiskAssessment> {
  const assessment = await assessPayoutRisk(db, providerId, amountCents);

  if (assessment.score >= RISK_THRESHOLD) {
    await db.auditLog.create({
      data: {
        action: "PAYOUT_RISK_BLOCKED",
        entityType: "ProviderProfile",
        entityId: providerId,
        newValue: {
          riskScore: assessment.score,
          signals: assessment.signals,
          amountCents,
          state: "MANUAL_REVIEW",
        },
        correlationId,
      },
    });
    logger.warn("Repasse bloqueado para revisão manual (risco)", {
      correlationId,
      providerId,
      riskScore: assessment.score,
    });
    throw new DomainError(
      "MANUAL_REVIEW",
      "Repasse retido para revisão manual por política antifraude",
      { riskScore: assessment.score },
    );
  }
  return assessment;
}
