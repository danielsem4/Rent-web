-- CreateEnum
CREATE TYPE "WorkerRequestType" AS ENUM ('MAINTENANCE', 'GENERAL');

-- CreateEnum
CREATE TYPE "WorkerRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "authEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mfaCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfaCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "mfaCodeHash" TEXT,
ADD COLUMN     "phoneE164" TEXT,
ADD COLUMN     "qrTokenHash" TEXT,
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WorkerRefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "workerId" INTEGER NOT NULL,
    "familyId" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerRequest" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "type" "WorkerRequestType" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "WorkerRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerRefreshToken_tokenHash_key" ON "WorkerRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkerRefreshToken_workerId_idx" ON "WorkerRefreshToken"("workerId");

-- CreateIndex
CREATE INDEX "WorkerRefreshToken_familyId_idx" ON "WorkerRefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "WorkerRequest_companyId_idx" ON "WorkerRequest"("companyId");

-- CreateIndex
CREATE INDEX "WorkerRequest_workerId_idx" ON "WorkerRequest"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_qrTokenHash_key" ON "Worker"("qrTokenHash");

-- CreateIndex
CREATE INDEX "Worker_phoneE164_idx" ON "Worker"("phoneE164");

-- AddForeignKey
ALTER TABLE "WorkerRefreshToken" ADD CONSTRAINT "WorkerRefreshToken_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerRequest" ADD CONSTRAINT "WorkerRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerRequest" ADD CONSTRAINT "WorkerRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Partial UNIQUE index on the normalized phone, scoped to app-enabled workers
-- (SECURITY_PRINCIPLES.md §17). Prisma cannot express a filtered unique index in
-- schema attributes, so it is authored here directly. This guarantees the
-- "type your phone number" login path resolves to AT MOST ONE enabled worker;
-- disabled/data-only workers may still share (or lack) a phone without conflict.
CREATE UNIQUE INDEX "worker_phonee164_authenabled_uq"
  ON "Worker"("phoneE164")
  WHERE "authEnabled" = true AND "phoneE164" IS NOT NULL;
