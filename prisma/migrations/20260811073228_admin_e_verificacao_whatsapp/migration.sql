-- CreateEnum
CREATE TYPE "VerificationChannel" AS ENUM ('WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('CADASTRO', 'TROCA_TELEFONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CADASTRO_APROVADO';
ALTER TYPE "NotificationType" ADD VALUE 'CADASTRO_REJEITADO';
ALTER TYPE "NotificationType" ADD VALUE 'VERIFICACAO';

-- CreateTable
CREATE TABLE "phone_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" "VerificationChannel" NOT NULL DEFAULT 'WHATSAPP',
    "purpose" "VerificationPurpose" NOT NULL DEFAULT 'CADASTRO',
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sendError" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_verifications_userId_createdAt_idx" ON "phone_verifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "phone_verifications_phone_createdAt_idx" ON "phone_verifications"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "phone_verifications_expiresAt_idx" ON "phone_verifications"("expiresAt");

-- AddForeignKey
ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
