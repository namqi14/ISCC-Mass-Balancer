/**
 * Local development database: a real PostgreSQL started from this project
 * (the `embedded-postgres` npm package -- nothing to install, no Docker, free,
 * works offline). Replaces XAMPP's MySQL now that the project is on Postgres
 * (Supabase in production).
 *
 *   npm run db:dev
 *
 * Leave it running in its own terminal. Data persists in backend/.pgdata
 * (git-ignored); delete that folder to start from a blank database.
 *
 * Connection string for backend/.env (DATABASE_URL and DIRECT_URL the same):
 *   postgresql://postgres:postgres@localhost:5433/mass_balancer
 *
 * `.mts` because embedded-postgres is ESM-only and this backend is CommonJS.
 * Dev-only: embedded-postgres is a devDependency and is never used in production.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.PG_DATA_DIR || path.join(here, "..", ".pgdata");
const port = Number(process.env.PG_DEV_PORT || 5433);
const databaseName = process.env.PG_DEV_DB || "mass_balancer";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
});

const isFresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
if (isFresh) await pg.initialise();
await pg.start();

try {
  await pg.createDatabase(databaseName);
} catch {
  // Already exists from a previous run -- nothing to do.
}

// eslint-disable-next-line no-console
console.log(`Embedded Postgres ready: postgresql://postgres:postgres@localhost:${port}/${databaseName}`);
// eslint-disable-next-line no-console
console.log("Leave this running. Ctrl+C to stop.");

async function shutdown() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => undefined, 1 << 30); // keep the process alive
