/**
 * OAuth2/OIDC Authorization Code + PKCE flow, configured for any standards-
 * compliant OIDC provider via env vars. The code path here (state, PKCE,
 * redirect, callback, token exchange, nonce validation, email lookup, JWT
 * issuance, error handling for expired/replayed state or an unmatched
 * email) is correct and independently testable today. The actual happy-path
 * exchange -- discovery hitting a real issuer's
 * /.well-known/openid-configuration and a genuine code exchange -- requires
 * registering a real OAuth application with an actual OIDC provider (Google
 * Workspace, Okta, Auth0, Azure AD, etc.) and setting real credentials
 * below; that cannot be simulated in this environment.
 *
 * SSO here means linking to an existing, admin-provisioned User by verified
 * email -- consistent with this app's existing model (an admin creates
 * accounts; there's no self-service signup). An unmatched email is a clean
 * rejection, not an account creation.
 */

import * as client from "openid-client";
import { AppError } from "./errors";

let cachedConfig: client.Configuration | null = null;

/** Lazy: discovery makes a real network call to the issuer, so this only
 * happens the first time someone actually starts the OAuth flow, not at
 * server boot (where a misconfigured/absent issuer would otherwise hang or
 * fail app startup for a feature nobody may be using). */
export async function getOidcConfig(): Promise<client.Configuration> {
  if (cachedConfig) return cachedConfig;

  const issuerUrl = process.env.OIDC_ISSUER_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuerUrl || !clientId) {
    throw new AppError(
      "OAuth2/SSO is not configured. Set OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and OIDC_REDIRECT_URI " +
        "(a real registered OAuth application with an OIDC provider) to enable it.",
      501,
      "OAUTH_NOT_CONFIGURED"
    );
  }

  cachedConfig = await client.discovery(new URL(issuerUrl), clientId, clientSecret);
  return cachedConfig;
}

export function getRedirectUri(): string {
  return process.env.OIDC_REDIRECT_URI || `http://localhost:${process.env.PORT || 4000}/api/auth/oauth/callback`;
}

/** Where the browser lands after a successful (or failed) SSO attempt --
 * reuses the existing CORS_ORIGIN env var as the frontend's base URL rather
 * than introducing a duplicate. */
export function getFrontendOrigin(): string {
  return process.env.CORS_ORIGIN || "http://localhost:5173";
}
