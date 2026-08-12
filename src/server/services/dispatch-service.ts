import { DomainError } from "@/domain/shared/errors";
import {
  distanceKm,
  rankDispatchCandidates,
  rotateCandidateToEnd,
  type RankedDispatchCandidate,
} from "@/domain/marketplace/dispatch";
import { serviceRequestMachine } from "@/domain/state-machines";
import { prisma } from "@/server/db/prisma";
import { emitEvent } from "@/server/events";
import { logger } from "@/server/observability/logger";
import { createProposal } from "@/server/services/proposal-service";
import type { Prisma } from "@/generated/prisma/client";

const ALERT_BATCH_SIZE = 5;
const LOCK_MINUTES = 10;

function lockExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + LOCK_MINUTES * 60_000);
}

function arredondarDistancia(distance: number | null): number | null {
  if (distance === null) return null;
  return Math.round(distance * 10) / 10;
}

type Tx = Prisma.TransactionClient;

async function listRankedCandidates(
  tx: Tx,
  requestId: string,
): Promise<RankedDispatchCandidate[]> {
  const request = await tx.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { address: true },
  });

  const providers = await tx.providerProfile.findMany({
    where: {
      status: "APROVADO",
      verified: true,
      deletedAt: null,
      services: {
        some: {
          categoryId: request.categoryId,
          active: true,
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      userId: true,
      baseLatitude: true,
      baseLongitude: true,
      serviceRadiusKm: true,
      reputationScore: true,
      avgResponseMinutes: true,
    },
  });

  const requestHasCoords =
    request.address.latitude !== null && request.address.longitude !== null;

  return rankDispatchCandidates(
    providers
      .map((provider) => {
        const hasProviderCoords =
          provider.baseLatitude !== null && provider.baseLongitude !== null;
        const distance =
          requestHasCoords && hasProviderCoords
            ? distanceKm(
                {
                  latitude: request.address.latitude!,
                  longitude: request.address.longitude!,
                },
                {
                  latitude: provider.baseLatitude!,
                  longitude: provider.baseLongitude!,
                },
              )
            : null;

        return {
          providerId: provider.id,
          userId: provider.userId,
          distanceKm: distance,
          reputationScore: provider.reputationScore,
          avgResponseMinutes: provider.avgResponseMinutes,
          serviceRadiusKm: provider.serviceRadiusKm,
        };
      })
      .filter((provider) => {
        if (provider.distanceKm === null) return true;
        return provider.distanceKm <= provider.serviceRadiusKm;
      })
      .map((candidate) => ({
        providerId: candidate.providerId,
        distanceKm: candidate.distanceKm,
        reputationScore: candidate.reputationScore,
        avgResponseMinutes: candidate.avgResponseMinutes,
      })),
  );
}

/**
 * Cria a fila de alerta para solicitações abertas sem técnico específico.
 * O cliente não escolhe prestador; o backend escolhe candidatos próximos.
 */
export async function startDispatchForRequest(
  requestId: string,
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.serviceDispatch.findUnique({ where: { requestId } });
    if (existing) return existing;

    const candidates = await listRankedCandidates(tx, requestId);
    const dispatch = await tx.serviceDispatch.create({
      data: {
        requestId,
        candidates: {
          create: candidates.map((candidate) => ({
            requestId,
            providerId: candidate.providerId,
            queuePosition: candidate.queuePosition,
            distanceKm: arredondarDistancia(candidate.distanceKm),
            status:
              candidate.queuePosition <= ALERT_BATCH_SIZE ? "ALERTADO" : "PENDENTE",
            alertCount: candidate.queuePosition <= ALERT_BATCH_SIZE ? 1 : 0,
            lastAlertedAt: candidate.queuePosition <= ALERT_BATCH_SIZE ? new Date() : null,
          })),
        },
      },
    });

    const alertedProviderIds = candidates
      .slice(0, ALERT_BATCH_SIZE)
      .map((candidate) => candidate.providerId);
    const alertedUsers = await tx.providerProfile.findMany({
      where: { id: { in: alertedProviderIds } },
      select: { userId: true, id: true },
    });

    await Promise.all(
      alertedUsers.map((provider) =>
        tx.notification.create({
          data: {
            userId: provider.userId,
            type: "NOVA_SOLICITACAO",
            title: "Novo pedido perto de você",
            body: "Abra o painel do prestador para aceitar ou negociar a solicitação.",
            linkUrl: "/pro/solicitacoes",
            metadata: { requestId, dispatchId: dispatch.id },
          },
        }),
      ),
    );

    await emitEvent(tx, {
      type: "dispatch.started",
      idempotencyKey: `dispatch.started:${requestId}`,
      correlationId,
      data: {
        request_id: requestId,
        dispatch_id: dispatch.id,
        alerted_providers: alertedProviderIds,
      },
    });

    logger.info("Fila de alerta criada", {
      correlationId,
      requestId,
      dispatchId: dispatch.id,
      candidates: candidates.length,
    });

    return dispatch;
  });
}

export async function listProviderDispatchAlerts(providerId: string) {
  const alerts = await prisma.dispatchCandidate.findMany({
    where: {
      providerId,
      status: "ALERTADO",
      dispatch: { status: "ATIVA", activeProviderId: null },
      request: { status: "ABERTA", deletedAt: null },
    },
    orderBy: [{ queuePosition: "asc" }, { updatedAt: "asc" }],
    include: {
      request: {
        include: {
          category: { select: { name: true } },
          address: {
            select: {
              neighborhood: true,
              cityName: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      },
    },
  });

  return alerts.map((alert) => ({
    candidateId: alert.id,
    requestId: alert.requestId,
    categoria: alert.request.category.name,
    bairro: alert.request.address.neighborhood,
    cidade: alert.request.address.cityName,
    urgencia: alert.request.urgency,
    equipamento: alert.request.equipmentType,
    quantidade: alert.request.quantity,
    descricao: alert.request.description,
    valorPropostoCents: alert.request.proposedPriceCents,
    distanciaKm: alert.distanceKm,
    latitude: alert.request.address.latitude,
    longitude: alert.request.address.longitude,
    alertadoEm: alert.lastAlertedAt?.toISOString() ?? alert.createdAt.toISOString(),
  }));
}

export async function acceptDispatchAlert(
  candidateId: string,
  providerId: string,
  correlationId: string,
) {
  const locked = await prisma.$transaction(async (tx) => {
    const candidate = await tx.dispatchCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      include: { dispatch: true, request: true },
    });

    if (candidate.providerId !== providerId) {
      throw new DomainError("DISPATCH_NOT_FOUND", "Alerta não encontrado");
    }
    if (candidate.status !== "ALERTADO" || candidate.dispatch.status !== "ATIVA") {
      throw new DomainError("DISPATCH_NOT_AVAILABLE", "Este alerta não está mais disponível");
    }
    if (candidate.dispatch.activeProviderId) {
      throw new DomainError(
        "DISPATCH_ALREADY_LOCKED",
        "Outro prestador entrou na negociação primeiro",
      );
    }
    if (candidate.request.status !== "ABERTA") {
      throw new DomainError(
        "REQUEST_NOT_AVAILABLE",
        "Esta solicitação já não está aberta para alerta",
      );
    }

    serviceRequestMachine.transition(candidate.request.status, "EM_NEGOCIACAO");

    const locked = await tx.serviceDispatch.updateMany({
      where: {
        id: candidate.dispatchId,
        status: "ATIVA",
        activeProviderId: null,
      },
      data: {
        status: "NEGOCIANDO",
        activeProviderId: providerId,
        lockExpiresAt: lockExpiresAt(),
      },
    });
    if (locked.count === 0) {
      throw new DomainError(
        "DISPATCH_ALREADY_LOCKED",
        "Outro prestador entrou na negociação primeiro",
      );
    }
    await tx.dispatchCandidate.update({
      where: { id: candidate.id },
      data: { status: "NEGOCIANDO", acceptedAt: new Date() },
    });
    await tx.dispatchCandidate.updateMany({
      where: {
        dispatchId: candidate.dispatchId,
        providerId: { not: providerId },
        status: "ALERTADO",
      },
      data: { status: "PULADO" },
    });
    await tx.serviceRequest.update({
      where: { id: candidate.requestId },
      data: { status: "EM_NEGOCIACAO" },
    });

    await emitEvent(tx, {
      type: "dispatch.locked",
      idempotencyKey: `dispatch.locked:${candidate.id}`,
      correlationId,
      data: {
        request_id: candidate.requestId,
        dispatch_id: candidate.dispatchId,
        provider_id: providerId,
      },
    });

    return {
      requestId: candidate.requestId,
      amountCents: candidate.request.proposedPriceCents,
      dispatchId: candidate.dispatchId,
    };
  });

  let proposal: Awaited<ReturnType<typeof createProposal>>;
  try {
    proposal = await createProposal(
      {
        requestId: locked.requestId,
        providerId,
        author: "CLIENTE",
        amountCents: locked.amountCents,
        message: "Proposta inicial do cliente vinculada ao alerta aceito.",
      },
      correlationId,
    );
  } catch (error) {
    await releaseDispatchNegotiation(locked.requestId, providerId, correlationId);
    throw error;
  }

  await prisma.serviceDispatch.update({
    where: { id: locked.dispatchId },
    data: { lockedProposalId: proposal.id },
  });

  return proposal;
}

export async function releaseDispatchNegotiation(
  requestId: string,
  providerId: string,
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.serviceDispatch.findUnique({
      where: { requestId },
      include: { candidates: { orderBy: { queuePosition: "asc" } } },
    });
    if (!dispatch || dispatch.activeProviderId !== providerId) return null;

    const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status === "CONTRATADA") {
      await tx.serviceDispatch.update({
        where: { id: dispatch.id },
        data: { status: "ENCERRADA", lockExpiresAt: null },
      });
      await tx.dispatchCandidate.updateMany({
        where: { dispatchId: dispatch.id, providerId },
        data: { status: "FECHADO" },
      });
      return dispatch;
    }

    if (request.status === "EM_NEGOCIACAO") {
      serviceRequestMachine.transition(request.status, "ABERTA");
      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: "ABERTA" },
      });
    }

    const rotated = rotateCandidateToEnd(
      dispatch.candidates.map((candidate) => ({
        providerId: candidate.providerId,
        distanceKm: candidate.distanceKm,
        reputationScore: 0,
        avgResponseMinutes: null,
        queuePosition: candidate.queuePosition,
      })),
      providerId,
    );
    const nextAlertedIds = rotated.slice(0, ALERT_BATCH_SIZE).map((c) => c.providerId);

    await Promise.all(
      rotated.map((candidate) =>
        tx.dispatchCandidate.update({
          where: { requestId_providerId: { requestId, providerId: candidate.providerId } },
          data: {
            queuePosition: candidate.queuePosition,
            status:
              candidate.providerId === providerId
                ? "RECUSADO"
                : nextAlertedIds.includes(candidate.providerId)
                  ? "ALERTADO"
                  : "PENDENTE",
            releasedAt: candidate.providerId === providerId ? new Date() : undefined,
            lastAlertedAt: nextAlertedIds.includes(candidate.providerId)
              ? new Date()
              : undefined,
            alertCount: nextAlertedIds.includes(candidate.providerId)
              ? { increment: 1 }
              : undefined,
          },
        }),
      ),
    );

    await tx.serviceDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: "ATIVA",
        activeProviderId: null,
        lockedProposalId: null,
        lockExpiresAt: null,
        lastReleasedProviderId: providerId,
        lastReleasedAt: new Date(),
        currentRound: { increment: 1 },
      },
    });

    await emitEvent(tx, {
      type: "dispatch.released",
      idempotencyKey: `dispatch.released:${dispatch.id}:${dispatch.currentRound + 1}`,
      correlationId,
      data: {
        request_id: requestId,
        dispatch_id: dispatch.id,
        released_provider_id: providerId,
        alerted_providers: nextAlertedIds,
      },
    });

    return dispatch;
  });
}
