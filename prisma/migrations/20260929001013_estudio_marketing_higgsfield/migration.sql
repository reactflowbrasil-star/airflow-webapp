-- CreateEnum
CREATE TYPE "MediaGenerationStatus" AS ENUM ('ENVIANDO', 'NA_FILA', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU', 'BLOQUEADA', 'CANCELADA', 'RECUSADA', 'INDETERMINADA');

-- CreateEnum
CREATE TYPE "MediaSurface" AS ENUM ('IMAGEM', 'VIDEO');

-- CreateTable
CREATE TABLE "media_generations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "surface" "MediaSurface" NOT NULL,
    "prompt" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "requestId" TEXT,
    "status" "MediaGenerationStatus" NOT NULL DEFAULT 'ENVIANDO',
    "resultUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "media_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_generations_requestId_key" ON "media_generations"("requestId");

-- CreateIndex
CREATE INDEX "media_generations_userId_createdAt_idx" ON "media_generations"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "media_generations_userId_idempotencyKey_key" ON "media_generations"("userId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "media_generations" ADD CONSTRAINT "media_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
