-- Rename the existing `capacity` column to `maxCapacity` (preserves data) and
-- add `total` for the current occupant count.
ALTER TABLE "Property" RENAME COLUMN "capacity" TO "maxCapacity";
ALTER TABLE "Property" ADD COLUMN "total" INTEGER NOT NULL DEFAULT 0;
