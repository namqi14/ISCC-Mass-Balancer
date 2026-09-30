-- Backs the idempotency middleware: one row per client-supplied
-- Idempotency-Key header per company, recording whether the mutating
-- request it names is still in progress, completed (with its cached
-- response), or failed. `companyId`/`userId` are plain indexed columns, not
-- enforced foreign keys -- this is operational bookkeeping, not an ISCC
-- domain entity.
CREATE TABLE `idempotency_keys` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(200) NOT NULL,
  `companyId` INT NOT NULL,
  `userId` INT NOT NULL,
  `route` VARCHAR(200) NOT NULL,
  `method` VARCHAR(10) NOT NULL,
  `requestHash` VARCHAR(64) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `responseStatus` INT NULL,
  `responseBody` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `idempotency_keys_companyId_key_key` (`companyId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
