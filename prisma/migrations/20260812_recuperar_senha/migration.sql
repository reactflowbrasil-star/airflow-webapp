Loaded Prisma config from prisma.config.ts.

-- AlterEnum
ALTER TYPE "VerificationPurpose" ADD VALUE 'RESET_SENHA';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

