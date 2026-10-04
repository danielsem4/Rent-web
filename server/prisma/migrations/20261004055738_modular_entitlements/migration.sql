-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "companyId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CompanyModule" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyModule_companyId_idx" ON "CompanyModule"("companyId");

-- CreateIndex
CREATE INDEX "CompanyModule_moduleKey_idx" ON "CompanyModule"("moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyModule_companyId_moduleKey_key" ON "CompanyModule"("companyId", "moduleKey");

-- AddForeignKey
ALTER TABLE "CompanyModule" ADD CONSTRAINT "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Modular multi-tenancy: data migration (hand-authored) ───────────────────
-- GRANDFATHER existing companies: enable the two currently-shipped modules for
-- every existing company so nothing breaks for current tenants. `analytics` is
-- deliberately NOT enabled (the feature is not built yet).
INSERT INTO "CompanyModule" ("companyId", "moduleKey", "enabled", "createdAt", "updatedAt")
SELECT "id", 'core-rent', true, now(), now() FROM "Company"
UNION ALL
SELECT "id", 'foreign-workers', true, now(), now() FROM "Company";

-- Detach platform admins from their (previously mandatory) company. A SUPER_ADMIN
-- is now a platform-scoped principal that belongs to no company.
UPDATE "User" SET "companyId" = NULL WHERE "role" = 'SUPER_ADMIN';

-- Invariant enforced at the DB level (cannot be expressed in the Prisma DSL):
-- only a SUPER_ADMIN may have a NULL companyId; every other role must belong to a
-- company. Added AFTER the super-admin detach so it validates cleanly. This CHECK
-- is additive/unmanaged — it will not round-trip into schema.prisma, so the
-- app-level checks (admin service + seed) remain the maintained backstop.
ALTER TABLE "User" ADD CONSTRAINT "user_company_required"
  CHECK ("role" = 'SUPER_ADMIN' OR "companyId" IS NOT NULL);
