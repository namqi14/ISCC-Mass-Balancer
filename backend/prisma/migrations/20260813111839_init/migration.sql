-- CreateTable
CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `registrationNumber` VARCHAR(100) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `email` VARCHAR(200) NOT NULL,
    `passwordHash` VARCHAR(200) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_USER') NOT NULL DEFAULT 'COMPANY_USER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `locationId` VARCHAR(100) NOT NULL,
    `certScheme` ENUM('ISCC_EU', 'ISCC_PLUS') NOT NULL,
    `operatorType` ENUM('TRADER', 'PROCESSING_UNIT') NOT NULL DEFAULT 'TRADER',
    `multiSiteBalancingEnabled` BOOLEAN NOT NULL DEFAULT false,
    `defaultPeriodLengthMonths` INTEGER NOT NULL DEFAULT 3,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sites_locationId_key`(`locationId`),
    INDEX `sites_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `previousPeriodId` INTEGER NULL,
    `closedAt` DATETIME(3) NULL,
    `closedById` INTEGER NULL,

    UNIQUE INDEX `periods_previousPeriodId_key`(`previousPeriodId`),
    INDEX `periods_companyId_idx`(`companyId`),
    UNIQUE INDEX `periods_siteId_startDate_key`(`siteId`, `startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `physical_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `documentType` VARCHAR(50) NOT NULL,
    `documentNumber` VARCHAR(100) NOT NULL,
    `documentDate` DATE NOT NULL,
    `issuedBy` VARCHAR(200) NULL,
    `fileReference` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `physical_documents_documentNumber_key`(`documentNumber`),
    INDEX `physical_documents_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `certScheme` ENUM('ISCC_EU', 'ISCC_PLUS') NOT NULL,
    `rawMaterial` VARCHAR(150) NOT NULL,
    `countryOfOrigin` VARCHAR(100) NOT NULL,
    `ghgValue` DECIMAL(10, 4) NOT NULL,
    `productType` ENUM('BIOMETHANE', 'BIOLNG') NOT NULL,
    `isMerged` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `batches_companyId_idx`(`companyId`),
    INDEX `batches_siteId_idx`(`siteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_merges` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `resultBatchId` INTEGER NOT NULL,
    `sourceBatchId` INTEGER NOT NULL,
    `contributedVolume` DECIMAL(18, 3) NOT NULL,
    `sourceGhgValue` DECIMAL(10, 4) NOT NULL,

    INDEX `batch_merges_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `periodId` INTEGER NOT NULL,
    `batchId` INTEGER NOT NULL,
    `transactionType` ENUM('INBOUND', 'OUTBOUND', 'CONVERSION_IN', 'CONVERSION_OUT') NOT NULL,
    `volume` DECIMAL(18, 3) NOT NULL,
    `transactionDate` DATE NOT NULL,
    `counterpartyName` VARCHAR(200) NULL,
    `counterpartyCertNumber` VARCHAR(100) NULL,
    `physicalDocumentId` INTEGER NULL,
    `schemeTransferId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` INTEGER NULL,

    INDEX `transactions_companyId_idx`(`companyId`),
    INDEX `transactions_periodId_idx`(`periodId`),
    INDEX `transactions_batchId_idx`(`batchId`),
    INDEX `transactions_schemeTransferId_idx`(`schemeTransferId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversion_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `periodId` INTEGER NOT NULL,
    `conversionFactorCf` DECIMAL(10, 6) NOT NULL,
    `conversionDate` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` INTEGER NULL,

    INDEX `conversion_events_companyId_idx`(`companyId`),
    INDEX `conversion_events_periodId_idx`(`periodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversion_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `conversionEventId` INTEGER NOT NULL,
    `transactionId` INTEGER NOT NULL,
    `role` ENUM('INPUT', 'OUTPUT') NOT NULL,

    INDEX `conversion_lines_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheme_transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `sourceSiteId` INTEGER NOT NULL,
    `targetSiteId` INTEGER NOT NULL,
    `batchId` INTEGER NOT NULL,
    `volume` DECIMAL(18, 3) NOT NULL,
    `transferDate` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` INTEGER NULL,

    INDEX `scheme_transfers_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `physical_stock_readings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `readingDate` DATE NOT NULL,
    `certifiedStockQty` DECIMAL(18, 3) NOT NULL,
    `fossilStockQty` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `source` VARCHAR(50) NOT NULL,
    `recordedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `physical_stock_readings_companyId_idx`(`companyId`),
    INDEX `physical_stock_readings_siteId_idx`(`siteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `period_balances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `periodId` INTEGER NOT NULL,
    `productType` ENUM('BIOMETHANE', 'BIOLNG') NOT NULL,
    `incomingA` DECIMAL(18, 3) NOT NULL,
    `openingInputInventoryA` DECIMAL(18, 3) NOT NULL,
    `conversionFactorCf` DECIMAL(10, 6) NOT NULL,
    `openingOutputInventoryB` DECIMAL(18, 3) NOT NULL,
    `totalAvailableB` DECIMAL(18, 3) NOT NULL,
    `outgoingC` DECIMAL(18, 3) NOT NULL,
    `closingBalance` DECIMAL(18, 3) NOT NULL,
    `creditsCarriedForward` DECIMAL(18, 3) NOT NULL,
    `ghgValueAssigned` DECIMAL(10, 4) NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `period_balances_companyId_idx`(`companyId`),
    UNIQUE INDEX `period_balances_periodId_productType_key`(`periodId`, `productType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` INTEGER NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `actorId` INTEGER NULL,
    `actorName` VARCHAR(200) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `beforeValue` TEXT NULL,
    `afterValue` TEXT NULL,
    `notes` TEXT NULL,

    INDEX `audit_log_companyId_idx`(`companyId`),
    INDEX `audit_log_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sites` ADD CONSTRAINT `sites_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `periods` ADD CONSTRAINT `periods_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `periods` ADD CONSTRAINT `periods_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `periods` ADD CONSTRAINT `periods_previousPeriodId_fkey` FOREIGN KEY (`previousPeriodId`) REFERENCES `periods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `periods` ADD CONSTRAINT `periods_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `physical_documents` ADD CONSTRAINT `physical_documents_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_merges` ADD CONSTRAINT `batch_merges_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_merges` ADD CONSTRAINT `batch_merges_resultBatchId_fkey` FOREIGN KEY (`resultBatchId`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_merges` ADD CONSTRAINT `batch_merges_sourceBatchId_fkey` FOREIGN KEY (`sourceBatchId`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_physicalDocumentId_fkey` FOREIGN KEY (`physicalDocumentId`) REFERENCES `physical_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_schemeTransferId_fkey` FOREIGN KEY (`schemeTransferId`) REFERENCES `scheme_transfers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversion_events` ADD CONSTRAINT `conversion_events_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversion_events` ADD CONSTRAINT `conversion_events_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversion_events` ADD CONSTRAINT `conversion_events_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversion_events` ADD CONSTRAINT `conversion_events_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversion_lines` ADD CONSTRAINT `conversion_lines_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversion_lines` ADD CONSTRAINT `conversion_lines_conversionEventId_fkey` FOREIGN KEY (`conversionEventId`) REFERENCES `conversion_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversion_lines` ADD CONSTRAINT `conversion_lines_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheme_transfers` ADD CONSTRAINT `scheme_transfers_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheme_transfers` ADD CONSTRAINT `scheme_transfers_sourceSiteId_fkey` FOREIGN KEY (`sourceSiteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheme_transfers` ADD CONSTRAINT `scheme_transfers_targetSiteId_fkey` FOREIGN KEY (`targetSiteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheme_transfers` ADD CONSTRAINT `scheme_transfers_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheme_transfers` ADD CONSTRAINT `scheme_transfers_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `physical_stock_readings` ADD CONSTRAINT `physical_stock_readings_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `physical_stock_readings` ADD CONSTRAINT `physical_stock_readings_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `physical_stock_readings` ADD CONSTRAINT `physical_stock_readings_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `period_balances` ADD CONSTRAINT `period_balances_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `period_balances` ADD CONSTRAINT `period_balances_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
