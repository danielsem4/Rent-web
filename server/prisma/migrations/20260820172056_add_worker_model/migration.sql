-- CreateTable
CREATE TABLE "Worker" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3),
    "preferredLanguage" TEXT,
    "passportNumberEnc" TEXT,
    "passportExpiry" TIMESTAMP(3),
    "visaType" TEXT,
    "visaExpiry" TIMESTAMP(3),
    "insuranceProvider" TEXT,
    "insurancePolicyNumEnc" TEXT,
    "insuranceCoverageType" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "phone" TEXT,
    "employer" TEXT,
    "propertyId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Worker_companyId_idx" ON "Worker"("companyId");

-- CreateIndex
CREATE INDEX "Worker_propertyId_idx" ON "Worker"("propertyId");

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
