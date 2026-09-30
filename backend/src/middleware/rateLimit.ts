/**
 * Two different limiters for two different jobs -- see rateLimitStore.ts's
 * header comment for why they're on two different stores.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { PrismaRateLimitStore } from "../lib/rateLimitStore";

/** A soft abuse net across every /api route. Default in-memory store: under
 * clustering, the effective ceiling becomes `limit x worker count` -- an
 * accepted, documented tradeoff for a net that isn't a hard security
 * boundary. */
export const generalApiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Real brute-force protection, so it's on the DB-backed store (shared
 * across every cluster worker) and keyed on IP + attempted email -- IP
 * alone would let a distributed attacker spray one email from many IPs, or
 * let one shared corporate/NAT IP lock out every real user behind it. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PrismaRateLimitStore(),
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "unknown")}:${String(req.body?.email ?? "").toLowerCase()}`,
  message: { error: "Too many login attempts. Try again in a few minutes.", code: "RATE_LIMITED" },
});
