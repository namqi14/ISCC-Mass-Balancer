# Deploying for testing: Vercel + Render + Supabase (no laptop needed)

**Frontend** → Vercel. **Backend** → Render. **Database + file storage** → Supabase.
This is a testing setup on free plans. Know the limits before you start:

| Service | Free-plan catch |
|---|---|
| Render (backend) | Sleeps after ~15 min without traffic; the first request afterwards takes 30–60 s. The background job worker only runs while it is awake. |
| Vercel (frontend) | The free *Hobby* plan is for **non-commercial** use. Fine for testing, not for paying clients. |
| Supabase (database) | Free projects can pause after a period of inactivity. |

Check each provider's current pricing and limits page; they change.

The code is already prepared. What's left needs **your accounts and secrets**, so these steps are yours.

## Already deployed an earlier version? Start here

You already have a Vercel project, a Render service and a Supabase project from the earlier (Postgres) version, so you are **updating**, not starting over. Your existing environment variables, `DATABASE_URL`/`DIRECT_URL` and Vercel's `VITE_API_URL` stay as they are. What's different: the old Supabase tables were created without migration history, so they have to be reset once, and Render needs two small settings changed.

**Do these in this order.**

1. **Commit and push to GitHub.** Render and Vercel both deploy from the repository. Make sure the new **`backend/prisma/migrations/`** folder is included. Without it the database gets no tables. Do not commit `backend/.env` (it is git-ignored) or `backend/.pgdata`. `backend/prisma/_mysql_migrations_archive/` is only an archive; you can delete it instead of committing it.
2. **Reset the old Supabase database (this deletes everything in it).** Only do this on the test project. In the Supabase dashboard open **SQL Editor** and run:
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres;
   ```
   Tables, test users and test transactions are gone for good. Files already uploaded to Storage are separate and are not touched.
3. **Update the Render service** (Settings):
   - **Build Command**: `npm install --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build`
   - **Start Command**: `npm run start` (and **Root Directory** `backend`, if it isn't already)
   - **Environment**: add `TRUST_PROXY` = `1`. Check that `DATABASE_URL` is the pooled string (port 6543) ending in `?pgbouncer=true&connection_limit=5`, and that `DIRECT_URL` is the session string (port 5432).
   - Then **Manual Deploy**. The build applies the new migration to the freshly reset database.
   `render.yaml` in the repo is only for creating a *new* service from a Blueprint; your existing service doesn't need it.
4. **Vercel** redeploys by itself on the push. The new `frontend/vercel.json` fixes page reloads on deep links (e.g. refreshing `/conversions`). Nothing else to change.
5. **Create the first accounts** (section 4 below): the reset removed the old users.
6. **Storage buckets**: `npm run storage:setup` is safe to re-run if the `logos` and `certificates` buckets already exist.

**If you push before resetting the database**, the Render build fails with a "database schema is not empty" error. That is harmless: Render keeps the old version running. Reset the database (step 2) and deploy again.

---

## 0. Before you start

- The project's database is **PostgreSQL**. The old MySQL migrations are archived in `backend/prisma/_mysql_migrations_archive` and are not used.
- Use an **empty** Supabase database. One that already has tables from an older version clashes with the new baseline migration, so reset it first (see "Already deployed an earlier version?" above) or create a new project.
- Push this code to GitHub (Render and Vercel deploy from the repository).

## 1. Supabase

1. Create a project (note the database password).
2. **Dashboard → Connect** and copy two connection strings from the *pooler* section:
   - **Transaction** (port 6543) → this becomes `DATABASE_URL`. Append `?pgbouncer=true&connection_limit=5`.
   - **Session** (port 5432) → this becomes `DIRECT_URL`.
3. **Project Settings → API**: copy the **Project URL** (`SUPABASE_URL`) and the **service_role** key (`SUPABASE_KEY`). Keep the service_role key secret.
4. Create the storage buckets. In `backend/.env` set `SUPABASE_URL` and `SUPABASE_KEY`, then:
   ```
   cd backend
   npm run storage:setup
   ```
   This creates public `logos` and `certificates` buckets. They are public because the code serves files by public URL: anyone with a file's link can open it.

## 2. Render (backend)

1. **New → Blueprint**, pick your GitHub repo. Render reads `render.yaml` and proposes the `iscc-mass-balancer-api` web service on the free plan.
2. Fill in the environment variables it asks for:
   - `DATABASE_URL`, `DIRECT_URL`: from Supabase step 2.
   - `SUPABASE_URL`, `SUPABASE_KEY`: from Supabase step 3.
   - `FIELD_ENCRYPTION_KEY`: generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
     and **save a copy somewhere safe**. If you lose it, encrypted fields become unreadable.
   - `CORS_ORIGIN`: your Vercel URL (step 3). You can put a placeholder now and edit it after.
   - `JWT_SECRET` is generated for you.
3. Deploy. The build applies the database migrations to Supabase automatically.
4. Open `https://<your-service>.onrender.com/api/health`. You should see `{"ok":true,...}`. Copy the service URL.

## 3. Vercel (frontend)

1. **Add New → Project**, pick the same repo, and set **Root Directory** to `frontend`. The Vite preset is detected.
2. Add one environment variable: `VITE_API_URL` = `https://<your-service>.onrender.com/api` (note the `/api` at the end).
3. Deploy, then copy the Vercel URL.
4. Go back to Render and set `CORS_ORIGIN` to that Vercel URL (no trailing slash), then redeploy the backend. Browsers will block the app's API calls until this matches.

## 4. Create the first accounts

From your PC, run the seed once against Supabase. Use a real password, not the demo one:

```
cd backend
# PowerShell:
$env:DATABASE_URL="<Supabase DIRECT_URL>"; $env:DIRECT_URL="<Supabase DIRECT_URL>"; $env:SEED_PASSWORD="<a strong password>"; npm run seed
```

This creates `superadmin@demo.local`, `admin@demo.local` and `entry@demo.local`, all with the `SEED_PASSWORD` you gave. If you skip `SEED_PASSWORD` they get the well-known demo password, which is unsafe on a public site.

## 5. Check it works

- Open the Vercel URL and log in as `admin@demo.local`.
- Wait 15+ minutes, reload: the first request is slow (Render waking up). That is expected on the free plan.
- Upload a company logo in Company Profile (this exercises Supabase Storage).

## Things to know

- **Local development** needs no cloud: `npm run db:dev` (its own terminal) starts a real Postgres on your PC, then `npm run seed`, `npm run dev`. Data lives in `backend/.pgdata` (delete the folder for a blank database).
- **Not tested from here:** the real Render/Vercel/Supabase deployment, the Supabase pooler connection, Render's proxy setting (`TRUST_PROXY=1`), and file uploads (they need your real keys). If something fails on first deploy, start by reading the Render logs.
- The migrations folder holds a single Postgres baseline. For later schema changes run `npx prisma migrate dev --name <change>` locally (against the embedded database), then commit the new migration; Render applies it on the next deploy.
