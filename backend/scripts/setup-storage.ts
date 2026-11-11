/**
 * One-off: creates the two Supabase Storage buckets the backend expects
 * (companies.routes.ts uploads logos, sites.routes.ts uploads ISCC certificate
 * PDFs). Safe to re-run -- existing buckets are left alone.
 *
 *   cd backend && npm run storage:setup
 *
 * Needs SUPABASE_URL and SUPABASE_KEY (the service_role key) in backend/.env.
 *
 * Both buckets are created PUBLIC because the code serves files through
 * getPublicUrl(). Anyone holding a file's URL can open it, so don't treat
 * uploaded certificates as confidential until the code moves to signed URLs.
 */
import "dotenv/config";
import { supabase } from "../src/lib/supabase";

const BUCKETS = ["logos", "certificates"];

async function main() {
  const { data: existing, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  for (const name of BUCKETS) {
    if (existing?.some((b) => b.name === name)) {
      console.log(`${name}: already exists`);
      continue;
    }
    const { error: createError } = await supabase.storage.createBucket(name, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
    });
    if (createError) throw createError;
    console.log(`${name}: created (public)`);
  }
}

main().catch((e) => {
  console.error("Storage setup failed:", e.message);
  process.exit(1);
});
