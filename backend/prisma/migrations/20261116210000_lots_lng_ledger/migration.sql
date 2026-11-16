-- Lots (batches.lotRef), the client's transaction references, tolling fields on
-- conversion events, and the shared physical LNG ledger. Additive only: existing
-- rows get NULL lotRef and keep behaving as pooled batches.

-- CreateEnum
CREATE TYPE "LngMovementType" AS ENUM ('DEDUCTION', 'OUTGOING');


-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "lotRef" VARCHAR(200);

-- AlterTable
ALTER TABLE "conversion_events" ADD COLUMN     "instructionRef" VARCHAR(200),
ADD COLUMN     "lngLotId" INTEGER,
ADD COLUMN     "lngQuantity" DECIMAL(18,3),
ADD COLUMN     "processingGhg" DECIMAL(10,4),
ADD COLUMN     "puSiteId" INTEGER,
ADD COLUMN     "reference" VARCHAR(200);

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "certifiedClaim" BOOLEAN,
ADD COLUMN     "location" VARCHAR(200),
ADD COLUMN     "reference" VARCHAR(200),
ADD COLUMN     "sdPosRef" VARCHAR(200);

-- CreateTable
CREATE TABLE "lng_lots" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "lotRef" VARCHAR(200) NOT NULL,
    "receiptDate" DATE NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" "Unit" NOT NULL DEFAULT 'MMBTU',
    "supplierName" VARCHAR(500),
    "reference" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "lng_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lng_movements" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "lngLotId" INTEGER NOT NULL,
    "type" "LngMovementType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "movementDate" DATE NOT NULL,
    "certScheme" "CertScheme",
    "conversionEventId" INTEGER,
    "reference" VARCHAR(200),
    "customer" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "lng_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lng_lots_companyId_idx" ON "lng_lots"("companyId");

-- CreateIndex
CREATE INDEX "lng_lots_siteId_idx" ON "lng_lots"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "lng_lots_companyId_siteId_lotRef_key" ON "lng_lots"("companyId", "siteId", "lotRef");

-- CreateIndex
CREATE INDEX "lng_movements_companyId_idx" ON "lng_movements"("companyId");

-- CreateIndex
CREATE INDEX "lng_movements_lngLotId_idx" ON "lng_movements"("lngLotId");

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_puSiteId_fkey" FOREIGN KEY ("puSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_lngLotId_fkey" FOREIGN KEY ("lngLotId") REFERENCES "lng_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lng_lots" ADD CONSTRAINT "lng_lots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lng_lots" ADD CONSTRAINT "lng_lots_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lng_lots" ADD CONSTRAINT "lng_lots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lng_movements" ADD CONSTRAINT "lng_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lng_movements" ADD CONSTRAINT "lng_movements_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lng_movements" ADD CONSTRAINT "lng_movements_lngLotId_fkey" FOREIGN KEY ("lngLotId") REFERENCES "lng_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lng_movements" ADD CONSTRAINT "lng_movements_conversionEventId_fkey" FOREIGN KEY ("conversionEventId") REFERENCES "conversion_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lng_movements" ADD CONSTRAINT "lng_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Pool uniqueness now also separates individual lots. Prisma cannot model this
-- partial index, so it is maintained by hand (same as the baseline). Rows with a
-- NULL lotRef collapse to '' and keep today's one-pool-per-attributes rule.
DROP INDEX "batches_pool_unique";
CREATE UNIQUE INDEX "batches_pool_unique" ON "batches" ("companyId", "siteId", "certScheme", "rawMaterial", "countryOfOrigin", "productType", "ghgValue", "unit", COALESCE("lotRef", ''))
WHERE "isMerged" = false;
