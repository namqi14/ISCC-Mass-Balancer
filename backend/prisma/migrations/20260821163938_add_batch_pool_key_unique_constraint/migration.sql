-- Closes the findOrCreateBatch race (see massBalanceEngine.ts): two
-- concurrent first-time INBOUND deliveries with identical grouping
-- attributes could both fail to find an existing pool and both create a
-- duplicate one. A DB-level unique constraint on the grouping key fixes
-- this properly, but only unmerged batches should be constrained -- a
-- legitimately merged batch can share the same tuple as an existing
-- unmerged one (e.g. it inherits a source batch's raw material) without
-- being a duplicate. MySQL has no partial/conditional unique index, so the
-- standard workaround is a generated column that's NULL whenever the row
-- doesn't need the constraint: a unique index never treats two NULLs as a
-- collision, so merged batches (poolKey always NULL) are completely
-- unconstrained, while two unmerged batches for the same
-- company/site/scheme/feedstock/origin/product/GHG tuple can never both
-- exist.
ALTER TABLE `batches`
  ADD COLUMN `poolKey` VARCHAR(400) GENERATED ALWAYS AS (
    CASE WHEN `isMerged` = 0 THEN
      CONCAT_WS('|', `companyId`, `siteId`, `certScheme`, `rawMaterial`, `countryOfOrigin`, `productType`, `ghgValue`)
    ELSE NULL END
  ) STORED;

CREATE UNIQUE INDEX `batches_poolKey_key` ON `batches`(`poolKey`);
