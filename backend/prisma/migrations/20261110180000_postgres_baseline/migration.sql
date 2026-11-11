-- PostgreSQL baseline (the project moved from MySQL/XAMPP to Postgres/Supabase).
-- Generated with `prisma migrate diff --from-empty --to-schema-datamodel`, plus the
-- hand-written partial unique index at the bottom. The old MySQL migrations are
-- archived in prisma/_mysql_migrations_archive and cannot run on Postgres.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_USER');

-- CreateEnum
CREATE TYPE "CertScheme" AS ENUM ('ISCC_EU', 'ISCC_PLUS');

-- CreateEnum
CREATE TYPE "OperatorType" AS ENUM ('TRADER', 'PROCESSING_UNIT');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('POME', 'BIOGAS', 'BIOMETHANE', 'BIOLNG');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INBOUND', 'OUTBOUND', 'CONVERSION_IN', 'CONVERSION_OUT');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversionRole" AS ENUM ('INPUT', 'OUTPUT');

-- CreateEnum
CREATE TYPE "GhgValueType" AS ENUM ('DDV', 'DV', 'AV');

-- CreateEnum
CREATE TYPE "WasteStatus" AS ENUM ('PRE_CONSUMER', 'POST_CONSUMER', 'MIXED', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('M3', 'NM3', 'METRIC_TONS', 'KG', 'M3_15C', 'J', 'KWH');

-- CreateEnum
CREATE TYPE "ConversionStage" AS ENUM ('P1', 'P2', 'P3', 'P4');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "registrationNumber" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxSites" INTEGER,
    "address" VARCHAR(500),
    "contactName" VARCHAR(200),
    "contactPhone" VARCHAR(50),
    "contactEmail" VARCHAR(200),
    "logoUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "passwordHash" VARCHAR(200) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'COMPANY_USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "locationId" VARCHAR(100) NOT NULL,
    "certScheme" "CertScheme" NOT NULL,
    "operatorType" "OperatorType" NOT NULL DEFAULT 'TRADER',
    "canConvertP1" BOOLEAN NOT NULL DEFAULT false,
    "canConvertP2" BOOLEAN NOT NULL DEFAULT false,
    "canConvertP3" BOOLEAN NOT NULL DEFAULT false,
    "canConvertP4" BOOLEAN NOT NULL DEFAULT false,
    "multiSiteBalancingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultPeriodLengthMonths" INTEGER NOT NULL DEFAULT 3,
    "country" VARCHAR(100) NOT NULL DEFAULT 'Malaysia',
    "certificateNumber" VARCHAR(100),
    "certifyingBody" VARCHAR(300),
    "certifiedFrom" DATE,
    "certifiedTo" DATE,
    "certifiedSiteRoles" VARCHAR(300),
    "certificateFileUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_site_access" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_site_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "previousPeriodId" INTEGER,
    "closedAt" TIMESTAMP(3),
    "closedById" INTEGER,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_documents" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "documentType" VARCHAR(50) NOT NULL,
    "documentNumber" VARCHAR(100) NOT NULL,
    "documentDate" DATE NOT NULL,
    "issuedBy" VARCHAR(500),
    "fileReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "certScheme" "CertScheme" NOT NULL,
    "rawMaterial" VARCHAR(150) NOT NULL,
    "countryOfOrigin" VARCHAR(100) NOT NULL,
    "ghgValue" DECIMAL(10,4) NOT NULL,
    "productType" "ProductType" NOT NULL,
    "ghgValueType" "GhgValueType" NOT NULL,
    "materialCategory" VARCHAR(60) NOT NULL,
    "wasteStatus" "WasteStatus",
    "unit" "Unit" NOT NULL DEFAULT 'M3',
    "isMerged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_merges" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "resultBatchId" INTEGER NOT NULL,
    "sourceBatchId" INTEGER NOT NULL,
    "contributedVolume" DECIMAL(18,3) NOT NULL,
    "sourceGhgValue" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "batch_merges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "batchId" INTEGER NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "volume" DECIMAL(18,3) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "counterpartyName" VARCHAR(500),
    "counterpartyCertNumber" VARCHAR(300),
    "physicalDocumentId" INTEGER,
    "schemeTransferId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "conversionFactorCf" DECIMAL(10,6) NOT NULL,
    "conversionDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_lines" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "conversionEventId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "role" "ConversionRole" NOT NULL,

    CONSTRAINT "conversion_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_rates" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "stage" "ConversionStage" NOT NULL,
    "sourceUnit" "Unit" NOT NULL,
    "factor" DECIMAL(12,6) NOT NULL,
    "minFactor" DECIMAL(12,6),
    "maxFactor" DECIMAL(12,6),
    "effectiveFrom" DATE NOT NULL,
    "note" VARCHAR(300),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_transfers" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceSiteId" INTEGER NOT NULL,
    "targetSiteId" INTEGER NOT NULL,
    "batchId" INTEGER NOT NULL,
    "volume" DECIMAL(18,3) NOT NULL,
    "transferDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "scheme_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_stock_readings" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "readingDate" DATE NOT NULL,
    "certifiedStockQty" DECIMAL(18,3) NOT NULL,
    "fossilStockQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "source" VARCHAR(50) NOT NULL,
    "recordedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_stock_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_balances" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "productType" "ProductType" NOT NULL,
    "incomingA" DECIMAL(18,3) NOT NULL,
    "openingInputInventoryA" DECIMAL(18,3) NOT NULL,
    "conversionFactorCf" DECIMAL(10,6) NOT NULL,
    "openingOutputInventoryB" DECIMAL(18,3) NOT NULL,
    "totalAvailableB" DECIMAL(18,3) NOT NULL,
    "outgoingC" DECIMAL(18,3) NOT NULL,
    "closingBalance" DECIMAL(18,3) NOT NULL,
    "creditsCarriedForward" DECIMAL(18,3) NOT NULL,
    "ghgValueAssigned" DECIMAL(10,4) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "actorId" INTEGER,
    "actorName" VARCHAR(200) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "notes" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "state" VARCHAR(200) NOT NULL,
    "codeVerifier" VARCHAR(300) NOT NULL,
    "nonce" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" VARCHAR(300) NOT NULL,
    "points" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "route" VARCHAR(200) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "payload" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "sites_locationId_key" ON "sites"("locationId");

-- CreateIndex
CREATE INDEX "sites_companyId_idx" ON "sites"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "user_site_access_userId_siteId_key" ON "user_site_access"("userId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "periods_previousPeriodId_key" ON "periods"("previousPeriodId");

-- CreateIndex
CREATE INDEX "periods_companyId_idx" ON "periods"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "periods_siteId_startDate_key" ON "periods"("siteId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "physical_documents_documentNumber_key" ON "physical_documents"("documentNumber");

-- CreateIndex
CREATE INDEX "physical_documents_companyId_idx" ON "physical_documents"("companyId");

-- CreateIndex
CREATE INDEX "batches_companyId_idx" ON "batches"("companyId");

-- CreateIndex
CREATE INDEX "batches_siteId_idx" ON "batches"("siteId");

-- CreateIndex
CREATE INDEX "batch_merges_companyId_idx" ON "batch_merges"("companyId");

-- CreateIndex
CREATE INDEX "transactions_companyId_idx" ON "transactions"("companyId");

-- CreateIndex
CREATE INDEX "transactions_periodId_idx" ON "transactions"("periodId");

-- CreateIndex
CREATE INDEX "transactions_batchId_idx" ON "transactions"("batchId");

-- CreateIndex
CREATE INDEX "transactions_schemeTransferId_idx" ON "transactions"("schemeTransferId");

-- CreateIndex
CREATE INDEX "conversion_events_companyId_idx" ON "conversion_events"("companyId");

-- CreateIndex
CREATE INDEX "conversion_events_periodId_idx" ON "conversion_events"("periodId");

-- CreateIndex
CREATE INDEX "conversion_lines_companyId_idx" ON "conversion_lines"("companyId");

-- CreateIndex
CREATE INDEX "conversion_rates_companyId_idx" ON "conversion_rates"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_rates_siteId_stage_sourceUnit_effectiveFrom_key" ON "conversion_rates"("siteId", "stage", "sourceUnit", "effectiveFrom");

-- CreateIndex
CREATE INDEX "scheme_transfers_companyId_idx" ON "scheme_transfers"("companyId");

-- CreateIndex
CREATE INDEX "physical_stock_readings_companyId_idx" ON "physical_stock_readings"("companyId");

-- CreateIndex
CREATE INDEX "physical_stock_readings_siteId_idx" ON "physical_stock_readings"("siteId");

-- CreateIndex
CREATE INDEX "period_balances_companyId_idx" ON "period_balances"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "period_balances_periodId_productType_key" ON "period_balances"("periodId", "productType");

-- CreateIndex
CREATE INDEX "audit_log_companyId_idx" ON "audit_log"("companyId");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_companyId_key_key" ON "idempotency_keys"("companyId", "key");

-- CreateIndex
CREATE INDEX "jobs_status_runAt_idx" ON "jobs"("status", "runAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_access" ADD CONSTRAINT "user_site_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_access" ADD CONSTRAINT "user_site_access_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_previousPeriodId_fkey" FOREIGN KEY ("previousPeriodId") REFERENCES "periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_documents" ADD CONSTRAINT "physical_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_merges" ADD CONSTRAINT "batch_merges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_merges" ADD CONSTRAINT "batch_merges_resultBatchId_fkey" FOREIGN KEY ("resultBatchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_merges" ADD CONSTRAINT "batch_merges_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_physicalDocumentId_fkey" FOREIGN KEY ("physicalDocumentId") REFERENCES "physical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_schemeTransferId_fkey" FOREIGN KEY ("schemeTransferId") REFERENCES "scheme_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_lines" ADD CONSTRAINT "conversion_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_lines" ADD CONSTRAINT "conversion_lines_conversionEventId_fkey" FOREIGN KEY ("conversionEventId") REFERENCES "conversion_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_lines" ADD CONSTRAINT "conversion_lines_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_rates" ADD CONSTRAINT "conversion_rates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_rates" ADD CONSTRAINT "conversion_rates_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_transfers" ADD CONSTRAINT "scheme_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_transfers" ADD CONSTRAINT "scheme_transfers_sourceSiteId_fkey" FOREIGN KEY ("sourceSiteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_transfers" ADD CONSTRAINT "scheme_transfers_targetSiteId_fkey" FOREIGN KEY ("targetSiteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_transfers" ADD CONSTRAINT "scheme_transfers_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_transfers" ADD CONSTRAINT "scheme_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_stock_readings" ADD CONSTRAINT "physical_stock_readings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_stock_readings" ADD CONSTRAINT "physical_stock_readings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_stock_readings" ADD CONSTRAINT "physical_stock_readings_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_balances" ADD CONSTRAINT "period_balances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_balances" ADD CONSTRAINT "period_balances_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Pool uniqueness (replaces MySQL's batches.poolKey generated column).
-- Closes findOrCreateBatch's race (see massBalanceEngine.ts): two concurrent
-- first-time INBOUND deliveries with identical grouping attributes could both
-- miss the lookup and both create a duplicate pool. A UNIQUE index over the
-- grouping key fixes it at the database level -- but only for UNMERGED
-- batches: a merged batch can legitimately share the tuple of an unmerged one
-- (it inherits a source's raw material), so the index is PARTIAL
-- (WHERE "isMerged" = false). Prisma cannot model partial indexes, which is
-- why this is raw SQL here and not in schema.prisma; the violation still
-- surfaces as Prisma P2002, which findOrCreateBatch catches and re-reads.
-- "unit" is part of the key because a pool's balance is a plain sum, valid
-- only if every transaction against it shares one unit.
CREATE UNIQUE INDEX "batches_pool_unique"
  ON "batches" ("companyId", "siteId", "certScheme", "rawMaterial", "countryOfOrigin", "productType", "ghgValue", "unit")
  WHERE "isMerged" = false;
