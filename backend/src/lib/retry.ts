/**
 * Generic retry-with-backoff for genuinely transient database failures.
 * Rollback already happens for free via `prisma.$transaction` -- any thrown
 * error inside one rolls back everything. This is only about retry: giving
 * a deadlock victim or a dropped connection a second chance instead of
 * surfacing it to the user as a failure.
 *
 * Deliberately narrow about what counts as "transient." A deadlock/lock-wait
 * timeout or a connection drop is retryable because nothing was written --
 * the whole `$transaction` callback rolled back, so re-running it from
 * scratch is a clean do-over with no partial-state risk. A deliberate
 * business rejection (any `AppError` -- `InsufficientStockError`,
 * `PeriodClosedError`, etc.) is a *decision*, not a glitch: retrying it
 * would either waste a round trip or, worse, silently paper over something
 * the user needs to see. Bad input (`ZodError`) won't fix itself either.
 * Callers should apply this at the outermost `prisma.$transaction(...)`
 * call in a route handler, not inside individual engine functions.
 */

import { Prisma } from "@prisma/client";

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
}

/** Prisma-normalized transient codes, plus a raw-errno/message fallback for
 * the rare case a MySQL/MariaDB error surfaces unnormalized (e.g. from a
 * raw `$queryRaw`/`$executeRaw` call rather than the query builder). */
export function isTransientDbError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: "Transaction failed due to a write conflict or a deadlock.
    // Please retry your transaction" -- Prisma's own code for exactly this.
    // P1001/P1017: can't reach the database server / server closed the
    // connection -- connection-level transients.
    return err.code === "P2034" || err.code === "P1001" || err.code === "P1017";
  }
  const message = err instanceof Error ? err.message : String(err);
  // errno 1213 = ER_LOCK_DEADLOCK, errno 1205 = ER_LOCK_WAIT_TIMEOUT.
  return /\b(1213|1205)\b/.test(message) || /deadlock/i.test(message) || /lock wait timeout/i.test(message);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 100, isRetryable = isTransientDbError } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) throw err;
      const backoff = baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }
  // Unreachable (the loop always returns or throws), but keeps TypeScript
  // happy about every path returning/throwing.
  throw lastErr;
}
