-- Backs the DB-backed rate-limit store used for the login rate limiter
-- only (the general per-IP API limiter stays on express-rate-limit's
-- default in-memory store -- see rateLimitStore.ts's header comment).
CREATE TABLE `rate_limit_counters` (
  `key` VARCHAR(300) NOT NULL,
  `points` INT NOT NULL,
  `resetAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
