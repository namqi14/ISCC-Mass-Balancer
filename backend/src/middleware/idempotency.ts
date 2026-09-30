/**
 * Idempotency-Key support for mutating endpoints. Applied per-route (record
 * transaction, conversions, scheme transfers, batch merge, open/close
 * period) -- not globally, since GET routes and unlisted POSTs don't need
 * it.
 *
 * No `Idempotency-Key` header -> passes through unchanged. Fully backward
 * compatible; no client is forced onto this.
 *
 * With one, designed specifically not to reintroduce the class of race this
 * project already spent real effort eliminating in `findOrCreateBatch`
 * (unique constraint + catch-and-reread instead of a plain check-then-act):
 *
 *   1. Try to `create` an `IN_PROGRESS` row keyed on (companyId, key).
 *   2. If that succeeds (first time seeing this key): let the real route
 *      handler run. `res.json` is wrapped so that whatever the handler (or
 *      the global error handler, for a thrown `AppError`) ultimately sends
 *      gets recorded against this row too.
 *   3. If it fails with P2002 (someone already used this key for this
 *      company), re-read the existing row:
 *      - status COMPLETED: the request hash must match the one stored, or
 *        this is a different request body reusing an old key (409,
 *        `IDEMPOTENCY_KEY_REUSE`). On match, replay the cached response
 *        verbatim -- the business logic never runs twice.
 *      - status IN_PROGRESS: a genuine concurrent duplicate. Short-poll
 *        (up to ~2s) for it to resolve and replay that outcome; if it never
 *        does, a clean 409 (`IDEMPOTENCY_IN_PROGRESS`) rather than hanging
 *        the request indefinitely.
 *
 * What counts as cacheable: everything the *route's own logic* decided,
 * which is any response under 500 -- a success, or a deliberate business
 * rejection (`AppError` -> 400/404/409 via the global error handler). Both
 * are deterministic given the same input and safe to replay, since the
 * underlying transaction already committed or rolled back with nothing
 * left in between. A 500 means something unexpected happened (the global
 * error handler's catch-all, which is exactly where an uncaught transient
 * DB error like a deadlock lands) -- caching that would mean a key
 * permanently replays "Unexpected server error" even after the underlying
 * problem is long gone, so the row is deleted instead, leaving the key free
 * for a genuine retry.
 */

import { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const POLL_INTERVAL_MS = 150;
const POLL_TIMEOUT_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashRequest(method: string, route: string, body: unknown): string {
  return crypto.createHash("sha256").update(`${method} ${route} ${JSON.stringify(body)}`).digest("hex");
}

export function idempotent() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header("Idempotency-Key");
    if (!key) return next();

    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const route = req.baseUrl + req.path;
    const method = req.method;
    const requestHash = hashRequest(method, route, req.body);

    async function claim() {
      return prisma.idempotencyKey.create({
        data: { key: key as string, companyId, userId, route, method, requestHash, status: "IN_PROGRESS" },
      });
    }

    let row;
    try {
      row = await claim();
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;

      // Someone already used this key for this company -- find out what
      // happened instead of running the handler again.
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let claimedAfterRelease = false;
      for (;;) {
        const existing = await prisma.idempotencyKey.findUnique({ where: { companyId_key: { companyId, key } } });
        if (!existing) {
          // The other attempt's row is gone (deleted after a 500, or never
          // committed) -- the key is free again, try to claim it ourselves.
          try {
            row = await claim();
            claimedAfterRelease = true;
          } catch (raceErr) {
            if (raceErr instanceof Prisma.PrismaClientKnownRequestError && raceErr.code === "P2002") continue; // someone else grabbed it first -- loop and re-read
            throw raceErr;
          }
          break;
        }

        if (existing.status === "COMPLETED") {
          if (existing.requestHash !== requestHash) {
            return res.status(409).json({
              error: "This Idempotency-Key was already used with a different request body.",
              code: "IDEMPOTENCY_KEY_REUSE",
            });
          }
          return res.status(existing.responseStatus ?? 200).json(existing.responseBody ? JSON.parse(existing.responseBody) : undefined);
        }

        // IN_PROGRESS
        if (Date.now() >= deadline) {
          return res.status(409).json({
            error: "A request with this Idempotency-Key is already being processed; retry shortly.",
            code: "IDEMPOTENCY_IN_PROGRESS",
          });
        }
        await sleep(POLL_INTERVAL_MS);
      }
      if (!claimedAfterRelease) return; // shouldn't happen, but keep TypeScript happy
    }

    const rowId = row!.id;
    const originalJson = res.json.bind(res);
    let settled = false;

    res.json = ((body: unknown) => {
      settled = true;
      const outcome = res.statusCode >= 500
        ? prisma.idempotencyKey.delete({ where: { id: rowId } })
        : prisma.idempotencyKey.update({
            where: { id: rowId },
            data: { status: "COMPLETED", responseStatus: res.statusCode, responseBody: JSON.stringify(body), completedAt: new Date() },
          });
      outcome.catch(() => {
        /* best-effort bookkeeping -- the real response has already been decided either way */
      });
      return originalJson(body);
    }) as typeof res.json;

    // Safety net: every route in this app responds via res.json (its own
    // success path, or the global error handler's catch-all), so this
    // shouldn't normally fire -- but if some future path ever responds a
    // different way (res.send, a raw socket close, etc.), don't leave the
    // key permanently stuck IN_PROGRESS, blocking every future retry.
    res.on("finish", () => {
      if (!settled) prisma.idempotencyKey.delete({ where: { id: rowId } }).catch(() => {});
    });

    next();
  };
}
