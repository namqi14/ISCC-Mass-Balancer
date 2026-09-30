-- Real ISCC certificate data per site (client-supplied EU/PLUS certificate
-- PDFs). All nullable: a site may not have a certificate on file yet, in
-- which case openNewPeriod applies no extra bound beyond today's
-- continuity/3-month checks (see massBalanceEngine.ts).
ALTER TABLE `sites`
  ADD COLUMN `certificateNumber` VARCHAR(100) NULL,
  ADD COLUMN `certifyingBody` VARCHAR(300) NULL,
  ADD COLUMN `certifiedFrom` DATE NULL,
  ADD COLUMN `certifiedTo` DATE NULL,
  ADD COLUMN `certifiedSiteRoles` VARCHAR(300) NULL;
