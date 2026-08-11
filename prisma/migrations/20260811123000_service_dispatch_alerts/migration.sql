CREATE TYPE "DispatchStatus" AS ENUM ('ATIVA', 'NEGOCIANDO', 'PAUSADA', 'ENCERRADA');

CREATE TYPE "DispatchCandidateStatus" AS ENUM ('PENDENTE', 'ALERTADO', 'NEGOCIANDO', 'RECUSADO', 'PULADO', 'EXPIRADO', 'FECHADO');

CREATE TABLE "service_dispatches" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'ATIVA',
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "activeProviderId" TEXT,
    "lockedProposalId" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "lastReleasedProviderId" TEXT,
    "lastReleasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatch_candidates" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "DispatchCandidateStatus" NOT NULL DEFAULT 'PENDENTE',
    "queuePosition" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "alertCount" INTEGER NOT NULL DEFAULT 0,
    "lastAlertedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_dispatches_requestId_key" ON "service_dispatches"("requestId");
CREATE INDEX "service_dispatches_status_updatedAt_idx" ON "service_dispatches"("status", "updatedAt");
CREATE INDEX "service_dispatches_activeProviderId_status_idx" ON "service_dispatches"("activeProviderId", "status");

CREATE UNIQUE INDEX "dispatch_candidates_requestId_providerId_key" ON "dispatch_candidates"("requestId", "providerId");
CREATE INDEX "dispatch_candidates_providerId_status_updatedAt_idx" ON "dispatch_candidates"("providerId", "status", "updatedAt");
CREATE INDEX "dispatch_candidates_dispatchId_queuePosition_idx" ON "dispatch_candidates"("dispatchId", "queuePosition");

ALTER TABLE "service_dispatches"
  ADD CONSTRAINT "service_dispatches_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_dispatches"
  ADD CONSTRAINT "service_dispatches_activeProviderId_fkey"
  FOREIGN KEY ("activeProviderId") REFERENCES "provider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dispatch_candidates"
  ADD CONSTRAINT "dispatch_candidates_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dispatch_candidates"
  ADD CONSTRAINT "dispatch_candidates_dispatchId_fkey"
  FOREIGN KEY ("dispatchId") REFERENCES "service_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dispatch_candidates"
  ADD CONSTRAINT "dispatch_candidates_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
