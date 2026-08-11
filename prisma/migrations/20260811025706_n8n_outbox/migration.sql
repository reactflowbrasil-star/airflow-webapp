-- CreateEnum
CREATE TYPE "OutboundEventStatus" AS ENUM ('PENDING', 'DELIVERED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "outbound_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" TEXT NOT NULL DEFAULT '1.0',
    "payload" JSONB NOT NULL,
    "correlationId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "OutboundEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbound_events_idempotencyKey_key" ON "outbound_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "outbound_events_status_nextAttemptAt_idx" ON "outbound_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbound_events_eventType_createdAt_idx" ON "outbound_events"("eventType", "createdAt");
