-- SUPER_ADMIN-assigned site quota per company (client clarification: "can
-- only create as much site as SUPER_ADMIN assigned to them"). NULL = no cap
-- set / unlimited.
ALTER TABLE `companies` ADD COLUMN `maxSites` INTEGER NULL;

-- Backfill KHPB (id=2) to its real current site count (3) -- an already-
-- operating company must not be retroactively capped below where it
-- already is. ALS Solutions (id=1, the platform operator, no sites of its
-- own) is left NULL/uncapped, matching every other future company until
-- SUPER_ADMIN deliberately sets a real number at onboarding.
UPDATE `companies` SET `maxSites` = 3 WHERE `id` = 2;
