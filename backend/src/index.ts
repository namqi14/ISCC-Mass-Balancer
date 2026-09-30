import "dotenv/config";
import cluster from "node:cluster";
import os from "node:os";
import path from "node:path";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes";
import { oauthRouter } from "./routes/oauth.routes";
import { companiesRouter } from "./routes/companies.routes";
import { sitesRouter } from "./routes/sites.routes";
import { periodsRouter } from "./routes/periods.routes";
import { batchesRouter } from "./routes/batches.routes";
import { documentsRouter } from "./routes/documents.routes";
import { transactionsRouter } from "./routes/transactions.routes";
import { conversionsRouter } from "./routes/conversions.routes";
import { schemeTransfersRouter } from "./routes/schemeTransfers.routes";
import { stockReadingsRouter } from "./routes/stockReadings.routes";
import { auditLogRouter } from "./routes/auditLog.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { errorHandler } from "./middleware/errorHandler";
import { startJobWorker } from "./lib/jobs";
import { generalApiLimiter } from "./middleware/rateLimit";

/**
 * Load balancing via Node's `cluster` module: one worker process per CPU
 * core, all sharing the same port -- genuinely real connection
 * distribution across processes on this single machine, no reverse proxy
 * (nginx/HAProxy) or extra installed software required.
 *
 * Off by default (`CLUSTER_ENABLED` unset/false): `tsx watch` (this
 * project's `npm run dev`) and `cluster.fork()` don't mix well -- each
 * forked worker would need its own `tsx` instance, breaking hot-reload.
 * Clustering is meant to be exercised via the built output
 * (`npm run build && npm start`), not the dev server.
 *
 * This is also the reason several other pieces of this backend are
 * DB-backed rather than in-memory: the login rate limiter, the idempotency
 * store, OAuth2's state table, and this file's own job-worker placement all
 * exist the way they do specifically because, once this is enabled, N
 * independent OS processes share nothing in memory. See each of those
 * files' own comments for the specifics.
 */
const CLUSTER_ENABLED = process.env.CLUSTER_ENABLED === "true";

function startServer() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
  app.use(express.json());

  // File uploads are now handled via Supabase Storage instead of local disk
  // to support serverless / ephemeral disk deployments (e.g. Render Free Tier).

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "mass-balancer-backend", pid: process.pid }));

  app.use("/api", generalApiLimiter);

  app.use("/api/auth", authRouter);
  app.use("/api/auth/oauth", oauthRouter);
  app.use("/api/companies", companiesRouter);
  app.use("/api/sites", sitesRouter);
  app.use("/api/periods", periodsRouter);
  app.use("/api/batches", batchesRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/conversions", conversionsRouter);
  app.use("/api/scheme-transfers", schemeTransfersRouter);
  app.use("/api/stock-readings", stockReadingsRouter);
  app.use("/api/audit-log", auditLogRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use((req, res) => res.status(404).json({ error: "Not found." }));
  app.use(errorHandler);

  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`ISCC Mass Balancer API listening on http://localhost:${port} (pid ${process.pid})`);
  });
}

if (CLUSTER_ENABLED && cluster.isPrimary) {
  // Deliberately NOT setting cluster.schedulingPolicy = SCHED_RR here.
  // Tested directly on this Windows dev machine: Node defaults to
  // SCHED_NONE on Windows (round-robin is Linux-only, per Node's own docs),
  // which in practice means one worker ends up handling nearly all
  // connections rather than an even spread -- confirmed by hitting
  // /api/health repeatedly and seeing the same pid every time. Forcing
  // SCHED_RR to fix that made it *worse*: every worker crashed immediately
  // on startup with EADDRINUSE (Node's round-robin accept-handle
  // distribution isn't properly supported on Windows), which combined with
  // the exit handler below into a runaway fork loop. So: real load
  // balancing via this mechanism, on this platform, only reliably works
  // multi-process at all (still real -- if one worker crashes, traffic
  // continues on the others, which was verified) rather than evenly
  // *distributed*. On Linux, SCHED_RR is already the default and needs no
  // extra code to get real round-robin distribution.
  const workerCount = Number(process.env.WEB_CONCURRENCY) || os.cpus().length;
  // eslint-disable-next-line no-console
  console.log(`[cluster] primary ${process.pid} forking ${workerCount} worker(s)...`);
  for (let i = 0; i < workerCount; i++) cluster.fork();

  // Crash-loop guard: without this, a worker that crashes immediately on
  // startup (a code bug, a port conflict, anything) refork -> immediately
  // crashes again -> refork, forever, spawning processes as fast as the OS
  // allows -- exactly what happened when testing SCHED_RR above, and it
  // took directly killing the primary by PID to stop (ordinary
  // process-by-process cleanup couldn't keep up). If more than
  // MAX_RAPID_EXITS happen within RAPID_EXIT_WINDOW_MS, stop reforking and
  // fail loudly instead of silently consuming the machine.
  const MAX_RAPID_EXITS = 5;
  const RAPID_EXIT_WINDOW_MS = 10_000;
  const recentExits: number[] = [];

  cluster.on("exit", (worker, code, signal) => {
    // eslint-disable-next-line no-console
    console.log(`[cluster] worker ${worker.process.pid} exited (${signal || code})`);

    const now = Date.now();
    recentExits.push(now);
    while (recentExits.length > 0 && now - recentExits[0] > RAPID_EXIT_WINDOW_MS) recentExits.shift();

    if (recentExits.length > MAX_RAPID_EXITS) {
      // eslint-disable-next-line no-console
      console.error(
        `[cluster] ${recentExits.length} workers exited within ${RAPID_EXIT_WINDOW_MS}ms -- ` +
          "not forking a replacement. Something is wrong (bad config, a port conflict, a startup bug); " +
          "fix it and restart rather than let this spawn processes indefinitely."
      );
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`[cluster] forking a replacement for ${worker.process.pid}`);
    cluster.fork();
  });

  // The primary never calls app.listen() itself -- it only forks/supervises
  // workers and owns the one-and-only job-worker loop (see jobs.ts).
  startJobWorker();
} else {
  // Either clustering is off (the single-process default this project runs
  // as day to day) or this is a forked worker -- either way, this process
  // serves HTTP traffic.
  startServer();
  if (!CLUSTER_ENABLED) {
    // Single-process mode: this file *is* the only process, so the job
    // worker runs right here instead of in a separate primary.
    startJobWorker();
  }
}
