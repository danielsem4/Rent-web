-- Redefine the Role enum: SUPER_ADMIN / COMPANY_MANAGER / COMPANY_WORKER / RENTER.
-- Mapping intent: ADMIN -> COMPANY_MANAGER, USER -> RENTER (no such rows exist in dev).
-- The column default is also dropped (roles are now always set explicitly).

-- Drop the default before swapping the type.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

-- Swap the enum type via rename + recreate + cast.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'COMPANY_MANAGER', 'COMPANY_WORKER', 'RENTER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";
