# ISCC Mass Balancer

A working implementation of the app described in [Mass-Balancer.MD](Mass-Balancer.MD) and the
[project proposal](References/Project%20Proposal%20&%20Quotation%20V2.pdf): a web app that
replaces manual Excel-based ISCC EU / ISCC PLUS mass balance bookkeeping for biomethane and
BioLNG, and enforces the compliance rules an ISCC audit checks for at the point of entry.

- **Backend:** Node.js, Express, TypeScript, Prisma ORM, MySQL — [backend/](backend/)
- **Frontend:** React, Vite, TypeScript, React Router, Axios — [frontend/](frontend/)
- **Database schema:** a direct implementation of [References/Database Schema.pdf](References/Database%20Schema.pdf)
  (the authoritative dbdiagram.io export, including its `user_role` enum notes), cross-checked
  against [References/models.py](References/models.py) and [References/iscc_mass_balance_schema.dbml](References/iscc_mass_balance_schema.dbml),
  which describe an earlier iteration of the same design. See the header comment in
  [backend/prisma/schema.prisma](backend/prisma/schema.prisma) for exactly what's added on top and why.
- **Business logic:** a direct TypeScript port of [References/mass_balance_engine.py](References/mass_balance_engine.py).
  See [backend/src/lib/massBalanceCalc.ts](backend/src/lib/massBalanceCalc.ts) (pure formula) and
  [backend/src/lib/massBalanceEngine.ts](backend/src/lib/massBalanceEngine.ts) (database orchestration).
- **Design system:** documented in [PRODUCT.md](PRODUCT.md) (who this is for and why) and
  [DESIGN.md](DESIGN.md) (the "Weighbridge Ledger" visual system: palette, type scale, components,
  do's and don'ts). The current pass implements
  [prototype/ISCC Mass Balancer.dc.html](prototype/ISCC%20Mass%20Balancer.dc.html), a client-supplied
  interactive mockup that is authoritative for layout and interaction patterns — including a few
  flows (close-period tolerance modal, reject-with-trace modal, conversion-trace modal, audit
  before/after diff modal, toast notifications) not yet ported into the real app. Design work is
  supported by the [Impeccable](https://impeccable.style) design skill
  (`.claude/skills/impeccable`, installed project-scoped); its anti-pattern detector can be re-run
  any time with `node .claude/skills/impeccable/scripts/detect.mjs <url-or-file>`. The detector's
  full browser/HTML-parsing mode needs the dev dependencies in the root `package.json` (`npm
  install` from the repo root) — this root manifest is tooling-only, not part of the app.

## What's enforced

Every rule from the problem statement in the project proposal is enforced server-side, not just
suggested in the UI — a rejected write always comes back with a plain-English reason:

| Rule | Where it's enforced |
|---|---|
| Credits can't be pooled across sites without authorization | `Site.multiSiteBalancingEnabled`, checked in `mergeBatches` |
| Balancing periods: no gaps, max 3 months | `openNewPeriod` |
| Inbound volume requires a weighbridge ticket / delivery note | `recordTransaction` |
| Outgoing volume can never exceed what's available | real-time check in `recordTransaction` + the formal `B ≥ C` check in `closePeriod` |
| ISCC EU carry-forward capped by physical stock; ISCC PLUS uncapped | `calculateCreditCarryForward` |
| Merged batches take the MAX (not average) GHG value | `mergeBatches` / `assignMergedGhgValue` |
| Booked vs. physical stock: 0.5% tolerance | `checkStockTolerance` |
| ISCC EU → ISCC PLUS transfer only, never the reverse | `createSchemeTransfer` |
| Append-only audit trail | `AuditLogEntry` model has no update/delete route anywhere in the API |

A scheme transfer isn't a side record: it books a real OUTBOUND transaction on the EU source pool
and a real INBOUND transaction on the PLUS target pool (linked via `Transaction.schemeTransferId`,
per `Database Schema.pdf`), so the volume is automatically included in each site's period-close
totals — not just in a separate scheme-transfers list.

Role-based access control uses the three roles from `Database Schema.pdf`'s `user_role` enum,
notes included verbatim: **SUPER_ADMIN** ("Your client - can see all companies" — in this
single-tenant Phase 1 build it behaves the same as COMPANY_ADMIN; true cross-company visibility is
a later multi-tenant phase), **COMPANY_ADMIN** ("The end client - manages their own company
sites/users" — full access, including closing periods and managing users), **COMPANY_USER**
("Data entry for specific sites" — can record data, cannot close periods or manage users).

## Local development setup

### 1. Database (XAMPP MySQL)

1. Start XAMPP Control Panel and start the **MySQL** module (port 3306). Apache is not required.
2. Create the database once:
   ```
   C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS mass_balancer CHARACTER SET utf8mb4;"
   ```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # defaults already match a stock XAMPP MySQL install
npx prisma migrate dev      # creates all tables
npm run seed                # creates the two real companies below, 3 users (one per role), 2 sites
npm run dev                 # http://localhost:4000
```

Seeded demo logins (password `ChangeMe123!` for all three):

| Email | Role | Company |
|---|---|---|
| `superadmin@demo.local` | SUPER_ADMIN | ALS Solutions (the platform operator — no sites/data of its own) |
| `admin@demo.local` | COMPANY_ADMIN | Kian Hoe Plantations Berhad (KHPB) |
| `entry@demo.local` | COMPANY_USER | Kian Hoe Plantations Berhad (KHPB) |

`SUPER_ADMIN`'s cross-company oversight isn't implemented yet (every route still
scopes by the requester's own `companyId`), so logging in as `superadmin@demo.local`
shows an empty app today — accurate given ALS has no operational data of its own, not
a bug. See `PRODUCT.md` for when this is planned to be revisited.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # points at http://localhost:4000/api by default
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 and log in with one of the seeded accounts above.

### Useful backend scripts

- `npm run prisma:studio` — browse the database in Prisma Studio.
- `npx prisma migrate reset` — wipe and re-apply all migrations (destructive).
- `npm run seed:khpb` — populates the KHPB Biomethane Plant site with **real** production
  figures from `References/Appendix 5 - KHPB ISCC PLUS Mass Balance (MB) Worksheet (2024-2025) (1).xlsx`
  (9 months, Sep 2024 – May 2025, split into three continuous 3-month periods, each opened,
  booked, and closed through the real engine code — not hand-typed results). Run `npm run seed`
  first. See the comment block at the top of [backend/prisma/seedKhpb.ts](backend/prisma/seedKhpb.ts)
  for exactly which cells the numbers come from and which two figures (GHG intensity, and the
  worksheet's internal biogas-routing detail) don't map onto this schema and are placeholders.

## Suggested first walkthrough

1. Log in as `admin@demo.local`.
2. **Periods & Close** → open a period for a site (e.g. Jan 1 – Mar 31).
3. **Record Transaction** → Inbound: pick that site/period, fill in the material details and a
   weighbridge ticket number, submit. Try submitting without a document number first — you'll be
   able to see the physical-document requirement (Rule 3) reject it either way once wired to a
   document.
4. **Pools & Balances** → see the new stock pool with its live available volume.
5. **Record Transaction** → Outbound from that same pool, for more than is available — see the
   real-time insufficient-stock rejection.
6. **Periods & Close** → close the period with opening inventory / conversion factor inputs, and
   see the computed `B = (A + a) × CF + b`, closing balance, and carry-forward — plus any soft
   alerts (e.g. no physical stock reading yet for an ISCC EU site).
7. **Audit Log** → see every one of the above actions recorded permanently.

## Project structure

```
mass-balancer/
├── Mass-Balancer.MD          # original project brief
├── References/                # source materials (business rules, prior prototypes, ISCC docs)
├── backend/
│   ├── prisma/schema.prisma   # MySQL schema (companies, users, sites, periods, batches, ...)
│   ├── prisma/seed.ts
│   └── src/
│       ├── lib/massBalanceCalc.ts     # pure B = (A+a)×CF+b formula + rule checks
│       ├── lib/massBalanceEngine.ts   # DB orchestration built on the above
│       ├── middleware/                # JWT auth + RBAC + error handling
│       └── routes/                    # one file per resource
└── frontend/
    └── src/
        ├── pages/              # one file per screen
        ├── context/AuthContext.tsx
        └── api/                # typed Axios client
```

## Out of scope for this build

Per the project proposal, these are intentionally deferred to a later phase and are not built
here: a multi-tenant client portal with external logins (the schema is tenant-isolated via
`companyId` on every table so this can be added later without reshaping data), automated
material-group matching against the official ISCC material list (material is free-text today),
sensor/IoT ingestion of physical stock readings (manual entry only), and integration with any
external certification-body system.
