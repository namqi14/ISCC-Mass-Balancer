/**
 * A `express-rate-limit` Store backed by the `rate_limit_counters` table --
 * used only for the login rate limiter (see middleware/rateLimit.ts). The
 * general per-IP API limiter deliberately stays on express-rate-limit's
 * default in-memory store instead: under clustering (item 8) that limiter's
 * effective ceiling becomes `limit x worker count`, which is an accepted,
 * documented tradeoff for a soft abuse net. The login limiter is the one
 * place accuracy actually matters (real brute-force protection), and the
 * login redirect/callback-style split across processes isn't even the
 * concern here -- it's that N cluster workers must all agree on one
 * attempt count for a given IP+email, which only a shared store can do.
 *
 * The increment is one atomic `INSERT ... ON DUPLICATE KEY UPDATE`
 * statement, not a read-then-write -- a plain check-then-act here would
 * reintroduce the exact class of race this project already spent real
 * effort eliminating elsewhere (see `lockBatchesForUpdate`/`poolKey`).
 */

import type { Store, ClientRateLimitInfo } from "express-rate-limit";
import { prisma } from "./prisma";

export class PrismaRateLimitStore implements Store {
  localKeys = false; // state is shared (DB-backed), not per-instance
  private windowMs = 60_000;

  init(options: { windowMs: number }): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);

    // If the row doesn't exist, insert it fresh. If it does and its window
    // has expired, reset to 1 with a new window. Otherwise, bump the count
    // within the existing window. All in one statement -- no race window
    // between reading the old count and writing the new one.
    await prisma.$executeRaw`
      INSERT INTO rate_limit_counters ("key", points, "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        points = CASE WHEN rate_limit_counters."resetAt" <= ${now} THEN 1 ELSE rate_limit_counters.points + 1 END,
        "resetAt" = CASE WHEN rate_limit_counters."resetAt" <= ${now} THEN ${resetAt} ELSE rate_limit_counters."resetAt" END
    `;

    const row = await prisma.rateLimitCounter.findUnique({ where: { key } });
    // Row must exist immediately after the upsert above; this null check is
    // just to satisfy TypeScript, not a real runtime possibility.
    return { totalHits: row?.points ?? 1, resetTime: row?.resetAt ?? resetAt };
  }

  async decrement(key: string): Promise<void> {
    await prisma.rateLimitCounter.updateMany({ where: { key, points: { gt: 0 } }, data: { points: { decrement: 1 } } });
  }

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  }
}
