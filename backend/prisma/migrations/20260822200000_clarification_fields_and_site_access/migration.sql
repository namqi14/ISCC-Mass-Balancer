-- Client clarification pass (Clarification.txt + updated ISCC material
-- lists): adds ghgValueType/materialCategory/wasteStatus/unit to Batch,
-- country to Site, and a new user_site_access join table for site-scoped
-- RBAC (see schema.prisma's own comments on each field for the reasoning).

-- ---------------------------------------------------------------------
-- batches: drop poolKey first -- it's a generated column derived from the
-- grouping-key columns, and we're about to add `unit` to that same key, so
-- it has to be rebuilt anyway. Dropping it up front avoids fighting with a
-- generated column while adding unrelated columns beside it.
-- ---------------------------------------------------------------------
DROP INDEX `batches_poolKey_key` ON `batches`;
ALTER TABLE `batches` DROP COLUMN `poolKey`;

-- ghgValueType: no application-level default (see schema.prisma) -- every
-- new write must deliberately choose one. Existing rows predate this field
-- entirely and were seeded with a placeholder GHG figure to begin with
-- (see seedKhpb.ts's GHG_PLACEHOLDER), so backfilling them as 'DV'
-- ("Default Value") is the honest characterization: closer to "not an
-- independently verified actual figure" than claiming 'AV'.
ALTER TABLE `batches` ADD COLUMN `ghgValueType` ENUM('DDV', 'DV', 'AV') NULL;
UPDATE `batches` SET `ghgValueType` = 'DV';
ALTER TABLE `batches` MODIFY COLUMN `ghgValueType` ENUM('DDV', 'DV', 'AV') NOT NULL;

-- materialCategory: every existing batch is ISCC_PLUS (confirmed via
-- `groupBy(certScheme)` before writing this migration), and KHPB's real
-- feedstock (POME-derived biomethane/Bio-LNG) is a biological-origin
-- waste/residue, so 'Bio-Circular' is the factually correct backfill, not
-- a guess.
ALTER TABLE `batches` ADD COLUMN `materialCategory` VARCHAR(60) NULL;
UPDATE `batches` SET `materialCategory` = 'Bio-Circular';
ALTER TABLE `batches` MODIFY COLUMN `materialCategory` VARCHAR(60) NOT NULL;

-- wasteStatus: required only when materialCategory = 'Bio-Circular', which
-- is every existing row -- but there's no real historical record of
-- pre/post-consumer status for this backfill to draw on, so 'UNSPECIFIED'
-- is used rather than fabricating a pre/post-consumer claim.
ALTER TABLE `batches` ADD COLUMN `wasteStatus` ENUM('PRE_CONSUMER', 'POST_CONSUMER', 'MIXED', 'UNSPECIFIED') NULL;
UPDATE `batches` SET `wasteStatus` = 'UNSPECIFIED';

-- unit: keeps a real application-level default (M3) -- unlike ghgValueType,
-- volume-based m3 genuinely is the overwhelmingly common case for this
-- domain's gas volumes, and matches every existing row's historical
-- implicit assumption.
ALTER TABLE `batches` ADD COLUMN `unit` ENUM('M3', 'METRIC_TONS', 'KG', 'M3_15C', 'J', 'KWH') NOT NULL DEFAULT 'M3';

-- Rebuild poolKey with `unit` joining the grouping key (see schema.prisma's
-- comment on Batch.unit for why: a pool's balance is a plain sum, only
-- valid if every transaction against it shares one unit).
ALTER TABLE `batches`
  ADD COLUMN `poolKey` VARCHAR(400) GENERATED ALWAYS AS (
    CASE WHEN `isMerged` = 0 THEN
      CONCAT_WS('|', `companyId`, `siteId`, `certScheme`, `rawMaterial`, `countryOfOrigin`, `productType`, `ghgValue`, `unit`)
    ELSE NULL END
  ) STORED;

CREATE UNIQUE INDEX `batches_poolKey_key` ON `batches`(`poolKey`);

-- ---------------------------------------------------------------------
-- sites: country, needed for the not-yet-built PLUS-to-PLUS transfer's
-- same/neighboring-country check. Every existing site is KHPB's, in
-- Malaysia -- a real, correct backfill, not a placeholder.
-- ---------------------------------------------------------------------
ALTER TABLE `sites` ADD COLUMN `country` VARCHAR(100) NOT NULL DEFAULT 'Malaysia';

-- ---------------------------------------------------------------------
-- user_site_access: scopes a COMPANY_ADMIN/COMPANY_USER to specific sites
-- without adding a 4th UserRole value (see schema.prisma's comment on this
-- model and PRODUCT.md for the reasoning). No rows for a user = unrestricted
-- within their company, matching today's behavior unchanged.
-- ---------------------------------------------------------------------
CREATE TABLE `user_site_access` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_site_access_userId_siteId_key`(`userId`, `siteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

ALTER TABLE `user_site_access` ADD CONSTRAINT `user_site_access_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `user_site_access` ADD CONSTRAINT `user_site_access_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
