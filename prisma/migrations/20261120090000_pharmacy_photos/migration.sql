-- CreateEnum
CREATE TYPE "PharmacyPhotoKind" AS ENUM ('EXTERIOR', 'INTERIOR');

-- CreateTable
CREATE TABLE "PharmacyPhoto" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "PharmacyPhotoKind" NOT NULL DEFAULT 'EXTERIOR',
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rightsConfirmedAt" TIMESTAMP(3) NOT NULL,
    "confirmedById" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PharmacyPhoto_pharmacyId_sortOrder_idx" ON "PharmacyPhoto"("pharmacyId", "sortOrder");

-- AddForeignKey
ALTER TABLE "PharmacyPhoto" ADD CONSTRAINT "PharmacyPhoto_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

