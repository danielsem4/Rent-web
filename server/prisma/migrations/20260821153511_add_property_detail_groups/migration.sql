-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('PROPERTY_TAX', 'ELECTRICITY', 'WATER', 'HOA', 'GAS');

-- CreateEnum
CREATE TYPE "UtilityBillStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "EquipmentCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'BROKEN');

-- CreateEnum
CREATE TYPE "GuaranteeType" AS ENUM ('BANK_GUARANTEE', 'CASH_DEPOSIT', 'CHECK', 'PROMISSORY_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "GuaranteeStatus" AS ENUM ('ACTIVE', 'RETURNED', 'EXPIRED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('CLEANING', 'MAINTENANCE', 'PEST_CONTROL', 'OTHER');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "rooms" INTEGER;

-- CreateTable
CREATE TABLE "UtilityBill" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "type" "UtilityType" NOT NULL,
    "status" "UtilityBillStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilityBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" "EquipmentCondition" NOT NULL DEFAULT 'GOOD',
    "serialNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guarantee" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "type" "GuaranteeType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "bank" TEXT,
    "expiryDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "status" "GuaranteeStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guarantee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "lastInspectionDate" TIMESTAMP(3),
    "nextInspectionDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UtilityBill_companyId_idx" ON "UtilityBill"("companyId");

-- CreateIndex
CREATE INDEX "UtilityBill_propertyId_idx" ON "UtilityBill"("propertyId");

-- CreateIndex
CREATE INDEX "Equipment_companyId_idx" ON "Equipment"("companyId");

-- CreateIndex
CREATE INDEX "Equipment_propertyId_idx" ON "Equipment"("propertyId");

-- CreateIndex
CREATE INDEX "Guarantee_companyId_idx" ON "Guarantee"("companyId");

-- CreateIndex
CREATE INDEX "Guarantee_propertyId_idx" ON "Guarantee"("propertyId");

-- CreateIndex
CREATE INDEX "Expense_companyId_idx" ON "Expense"("companyId");

-- CreateIndex
CREATE INDEX "Expense_propertyId_idx" ON "Expense"("propertyId");

-- CreateIndex
CREATE INDEX "Inspection_companyId_idx" ON "Inspection"("companyId");

-- CreateIndex
CREATE INDEX "Inspection_propertyId_idx" ON "Inspection"("propertyId");

-- AddForeignKey
ALTER TABLE "UtilityBill" ADD CONSTRAINT "UtilityBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityBill" ADD CONSTRAINT "UtilityBill_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guarantee" ADD CONSTRAINT "Guarantee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guarantee" ADD CONSTRAINT "Guarantee_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
