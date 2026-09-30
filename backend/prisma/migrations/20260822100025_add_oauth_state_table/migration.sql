-- Backs the OAuth2/OIDC Authorization Code + PKCE flow. DB-backed (not an
-- in-memory Map) because the /login redirect and /callback request are two
-- separate HTTP requests that can land on two different cluster workers.
CREATE TABLE `oauth_states` (
  `state` VARCHAR(200) NOT NULL,
  `codeVerifier` VARCHAR(300) NOT NULL,
  `nonce` VARCHAR(200) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`state`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
