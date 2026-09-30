-- Widens three columns that now hold application-level AES-256-GCM
-- ciphertext (see backend/src/lib/fieldEncryption.ts) instead of plaintext.
-- Ciphertext is meaningfully longer than the plaintext it replaces (a
-- versioned prefix, a base64 IV, a base64 auth tag, and base64-encoded
-- ciphertext all concatenated), so the original plaintext-sized column
-- limits would overflow. Existing rows are left as-is (legacy plaintext);
-- fieldEncryption.ts's decrypt function recognizes and passes through any
-- value that doesn't start with the "v1:" prefix, so no data migration of
-- already-seeded rows is required or performed here.
ALTER TABLE `transactions`
  MODIFY COLUMN `counterpartyName` VARCHAR(500) NULL,
  MODIFY COLUMN `counterpartyCertNumber` VARCHAR(300) NULL;

ALTER TABLE `physical_documents`
  MODIFY COLUMN `issuedBy` VARCHAR(500) NULL;
