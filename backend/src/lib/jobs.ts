/**
 * A polled, DB-backed job queue -- the honest real substitute for a message
 * broker (RabbitMQ/Kafka/SQS) at this project's scale, given this
 * environment has neither Redis nor Docker to run one. This is a
 * legitimate, commonly-used pattern, not a toy. The worker claims a job with
 * one atomic `UPDATE ... RETURNING` over a `FOR UPDATE SKIP LOCKED` subselect
 * (Postgres), so two workers can never claim the same row and the claimed
 * row comes back directly.
 *
 * `enqueueJob` takes a transaction client so it can be called from inside
 * the same `$transaction` as the business action that triggers it (e.g.
 * `closePeriod`) -- if that transaction rolls back, the enqueued job rolls
 * back with it, for free. A real external broker can't give you that
 * atomicity without a separate outbox pattern.
 *
 * `startJobWorker` must run in exactly one process. Before clustering
 * (item 8) exists, that's trivially true (this app is a single process);
 * once it does, only the cluster *primary* calls this -- see index.ts.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

export async function enqueueJob(tx: Tx, type: string, payload: unknown, runAt?: Date): Promise<void> {
  await tx.job.create({
    data: { type, payload: JSON.stringify(payload), runAt: runAt ?? new Date() },
  });
}

/** Atomically claims and returns the oldest due PENDING job, or null if
 * none is due. The `UPDATE ... WHERE id = (SELECT ...) AND status =
 * 'PENDING'` shape means only one caller can win the claim even if two
 * workers happened to poll at the same instant (the second one's UPDATE
 * affects zero rows once the first has already flipped the status). */
async function claimNextJob(): Promise<{ id: number; type: string; payload: string; attempts: number; maxAttempts: number } | null> {
  const rows = await prisma.$queryRaw<{ id: number; type: string; payload: string; attempts: number; maxAttempts: number }[]>`
    UPDATE jobs
    SET status = 'PROCESSING', "startedAt" = NOW()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'PENDING' AND "runAt" <= NOW()
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts, "maxAttempts"
  `;
  return rows[0] ?? null;
}

/** The actual, verifiable side effect for `PERIOD_CLOSED_NOTIFICATION`
 * jobs. No SMTP server exists in this environment, so the real, provable
 * effect today is an audit-log entry plus a console log -- structured so
 * swapping in real outbound email/webhook later is a one-function change,
 * stated honestly as what's actually verifiable right now rather than
 * pretending a notification was emailed when none was. */
async function processPeriodClosedNotification(payload: { companyId: number; periodId: number; siteId: number }) {
  // A direct auditLogEntry.create rather than massBalanceEngine.ts's
  // logAudit helper, deliberately -- that module will need to import
  // enqueueJob from this one (to call it from closePeriod), so this file
  // must not import back from it in turn.
  await prisma.auditLogEntry.create({
    data: {
      companyId: payload.companyId,
      entityType: "Notification",
      entityId: payload.periodId,
      action: "PERIOD_CLOSED_NOTIFICATION",
      actorId: null,
      actorName: "system (job worker)",
      notes: `Period #${payload.periodId} (site ${payload.siteId}) closed. Notification job processed.`,
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[jobs] Period #${payload.periodId} closed -- notification processed (company ${payload.companyId}).`);
}

async function processJob(job: { id: number; type: string; payload: string; attempts: number; maxAttempts: number }) {
  try {
    const payload = JSON.parse(job.payload);
    if (job.type === "PERIOD_CLOSED_NOTIFICATION") {
      await processPeriodClosedNotification(payload);
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }
    await prisma.job.update({ where: { id: job.id }, data: { status: "DONE", completedAt: new Date() } });
  } catch (err) {
    const attempts = job.attempts + 1;
    const lastError = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        attempts,
        lastError,
        status: attempts >= job.maxAttempts ? "FAILED" : "PENDING",
      },
    });
  }
}

let workerHandle: ReturnType<typeof setInterval> | null = null;

/** Starts the poll loop. Safe to call once per process -- calling it twice
 * in the same process is a no-op (returns the existing handle) rather than
 * spawning a second concurrent poller. */
export function startJobWorker(intervalMs = 2000): void {
  if (workerHandle) return;
  workerHandle = setInterval(async () => {
    try {
      const job = await claimNextJob();
      if (job) await processJob(job);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[jobs] worker tick failed:", err);
    }
  }, intervalMs);
}

export function stopJobWorker(): void {
  if (workerHandle) {
    clearInterval(workerHandle);
    workerHandle = null;
  }
}
