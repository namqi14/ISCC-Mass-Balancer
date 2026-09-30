-- Company Profile module: fields COMPANY_ADMIN can fill in themselves via
-- PATCH /companies/me (name/registrationNumber already existed, gated to
-- SUPER_ADMIN-only before this). All nullable -- a company may not have
-- filled these in yet.
ALTER TABLE `companies`
  ADD COLUMN `address` VARCHAR(500) NULL,
  ADD COLUMN `contactName` VARCHAR(200) NULL,
  ADD COLUMN `contactPhone` VARCHAR(50) NULL,
  ADD COLUMN `contactEmail` VARCHAR(200) NULL,
  ADD COLUMN `logoUrl` VARCHAR(500) NULL;
