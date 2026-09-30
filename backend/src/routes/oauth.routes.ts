import { Router } from "express";
import * as client from "openid-client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { signToken } from "../lib/authTokens";
import { AppError } from "../lib/errors";
import { getOidcConfig, getRedirectUri, getFrontendOrigin } from "../lib/oauth";

export const oauthRouter = Router();

const STATE_TTL_MS = 10 * 60_000;

oauthRouter.get(
  "/login",
  asyncHandler(async (req, res) => {
    const config = await getOidcConfig();

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    await prisma.oAuthState.create({
      data: { state, codeVerifier, nonce, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
    });

    const authorizationUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: getRedirectUri(),
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });

    res.redirect(authorizationUrl.toString());
  })
);

oauthRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const stateParam = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!stateParam) throw new AppError("Missing state parameter.", 400, "OAUTH_MISSING_STATE");

    const stored = await prisma.oAuthState.findUnique({ where: { state: stateParam } });
    // Single-use: delete on first read regardless of what happens next, so
    // a replayed callback (same URL hit twice) can never succeed twice.
    if (stored) await prisma.oAuthState.delete({ where: { state: stateParam } }).catch(() => {});

    if (!stored) {
      throw new AppError("This sign-in link has expired or was already used. Start again.", 400, "OAUTH_INVALID_STATE");
    }
    if (stored.expiresAt < new Date()) {
      throw new AppError("This sign-in link has expired. Start again.", 400, "OAUTH_STATE_EXPIRED");
    }

    const config = await getOidcConfig();
    const currentUrl = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);

    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      expectedState: stateParam,
      expectedNonce: stored.nonce,
      pkceCodeVerifier: stored.codeVerifier,
    });

    const claims = tokens.claims();
    const email = typeof claims?.email === "string" ? claims.email : undefined;
    if (!email) {
      throw new AppError("The identity provider did not return a verified email address.", 400, "OAUTH_NO_EMAIL");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      // No self-service signup -- SSO only links to an existing,
      // admin-provisioned account.
      res.redirect(`${getFrontendOrigin()}/login?ssoError=no_account`);
      return;
    }

    const token = signToken({ userId: user.id, companyId: user.companyId, role: user.role, email: user.email, name: user.name });
    res.redirect(`${getFrontendOrigin()}/login#token=${token}`);
  })
);
