-- A polled job queue standing in for a real message broker (no Redis, no
-- Docker available in this dev environment to run one). `status`/`runAt`
-- are indexed together since the worker's claim query filters on both.
CREATE TABLE `jobs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(100) NOT NULL,
  `payload` TEXT NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INT NOT NULL DEFAULT 0,
  `maxAttempts` INT NOT NULL DEFAULT 3,
  `runAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `jobs_status_runAt_idx` (`status`, `runAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
