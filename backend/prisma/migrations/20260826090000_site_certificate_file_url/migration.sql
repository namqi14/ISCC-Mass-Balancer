-- Stores the ISCC certificate PDF itself once uploaded via the new
-- POST /sites/parse-certificate AI-assisted autofill endpoint. Nullable --
-- a site's certificate fields may be filled in manually with no file on
-- file at all. Same path-string convention as companies.logoUrl.
ALTER TABLE `sites`
  ADD COLUMN `certificateFileUrl` VARCHAR(500) NULL;
