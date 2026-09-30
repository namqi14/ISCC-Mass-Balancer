# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal operations and compliance staff at a biomethane / BioLNG producer or trader
(e.g. site data-entry clerks, company admins who manage sites/users and close periods,
and a super-admin who oversees multiple client companies). They are not consumers —
they are the people who used to keep this bookkeeping in Excel and now use this system
daily to record deliveries, run conversions, and close ISCC balancing periods ahead of
an ISCC audit. (Sourced from `Mass-Balancer.MD`, `README.md`, and `References/Database
Schema.pdf`'s `user_role` enum notes, which this project's schema quotes verbatim.)

**The two real companies (confirmed by the user, 2026-08-22, corrected from an earlier
placeholder "Demo Biomethane Sdn Bhd"):**
- **ALS Solutions** — the platform operator. Home of the `SUPER_ADMIN` user. Has no
  sites or operational data of its own; it's meant to oversee *other* companies' data
  once cross-company oversight is built (KIV'd — see Capabilities and Constraints).
- **Kian Hoe Plantations Berhad (KHPB)** — the actual client company. Home of the
  `COMPANY_ADMIN`/`COMPANY_USER` users and every real/seeded site, batch, and period.

**KHPB's real ISCC sites (2026-08-25, from `References/ISCC EU CERTIFICATE.pdf` and
`References/ISCC PLUS CERTIFICATE.pdf`):**
- **KHPB Trading Terminal** (ISCC EU, TRADER) — a genuinely separate real operation,
  confirmed with the client; trades EU-scheme material, not the plant's own
  production. No certificate on file for it yet.
- **KHPB Biomethane Plant** (ISCC PLUS, PROCESSING_UNIT) — holds
  `ISCC-PLUS-Cert-DE105-90342502` (Control Union Certifications Germany GmbH), valid
  24.09.2025–23.09.2026.
- **KHPB Biomethane Plant (EU)** (ISCC EU, PROCESSING_UNIT) — the *same physical
  plant* as above, dual-certified: also holds `EU-ISCC-Cert-ID250-65446910`
  (PT. Qualitas Sertifikasi Indonesia), valid 26.06.2026–25.06.2027. A second `Site`
  row was needed because `Site.certScheme` is single-valued and used throughout the
  engine (EU-cap-vs-PLUS-uncapped carry-forward, scheme-transfer direction checks) —
  the same pattern already used to keep the Trading Terminal separate.
- `Site` gained `certificateNumber`/`certifyingBody`/`certifiedFrom`/`certifiedTo`/
  `certifiedSiteRoles` (all nullable — a site may have no certificate on file yet).
  When `certifiedFrom`/`certifiedTo` are both set, `openNewPeriod` rejects any period
  whose start/end date falls outside that window (client clarification: Period & Close
  is based on the site's real certificate validity, not an arbitrary date range) —
  verified against the real certificate windows, including the exact boundary date.
  A site with no certificate on file is unconstrained by this, same as before.

Both companies' `registrationNumber` is the literal placeholder string
`PENDING-REGISTRATION` (the user's own convention, to be filled in with the real
numbers later) — use this same convention for any future company, not a fabricated
plausible-looking number.

## Product Purpose

Digitizes ISCC EU / ISCC PLUS mass balance bookkeeping for biomethane and BioLNG,
replacing manual Excel workflows. It applies the regulatory mass balance formula
`B = (A + a) × CF + b` automatically and enforces the compliance rules an ISCC audit
checks for **at the point of data entry** (site isolation, period continuity, physical
document requirement for inbound volume, no negative balance, EU carry-forward capped
by physical stock vs. PLUS uncapped, worst-case GHG value on merge, 0.5% booked-vs-
physical stock tolerance, one-directional EU→PLUS scheme transfers), so a bad entry is
rejected immediately instead of surfacing as a discrepancy during an audit months later.
Success means every number in a closed period is defensible and traceable, with a
gapless audit trail, without anyone manually re-deriving it from spreadsheet formulas.

## Positioning

Unlike a spreadsheet (which only checks arithmetic once someone remembers to look), this
system enforces the ISCC rulebook as hard, server-side constraints a user cannot bypass
by typing over a cell — every write either satisfies Rules 1–8 or is rejected with a
plain-English reason, and every accepted write is permanently logged. (See the rule
table in `README.md` and `References/mass_balance_engine.py`, which this app's
calculation/engine layer is a direct TypeScript port of.)

## Operating Context

Company → Sites (each tagged `ISCC_EU` or `ISCC_PLUS`, and a role like
`TRADER`/`PROCESSING_UNIT`) → Periods (max 3 months, no gaps) → Batches (pools of
material grouped by scheme/feedstock/origin/GHG value) → Transactions (inbound,
outbound, conversion) and Scheme Transfers between EU and PLUS sites. Inbound
transactions require a linked physical document (weighbridge ticket / delivery note).
Periods are opened, worked, and then formally closed, at which point the engine
computes the closing balance and carry-forward. Real production data exists for one
site (KHPB Biomethane Plant, 9 months Sep 2024–May 2025) sourced from
`References/Appendix 5 - KHPB ISCC PLUS Mass Balance (MB) Worksheet (2024-2025) (1).xlsx`
and seeded via `backend/prisma/seedKhpb.ts`.

**Batch/pool grouping, confirmed against the real workflow (2026-08-23)**: the client
described how staff actually look up a pool as five attributes — country of origin,
raw material type, ISCC scheme (EU/PLUS), GHG value, and product type. This matches
`Batch.poolKey`'s real grouping key exactly. Two more dimensions the engine also
enforces that weren't in that list were checked separately, not assumed: pools stay
scoped to one site (the five attributes are what's searched for *within* an
already-chosen site; Rule 1's default site isolation is unchanged), and `unit` stays
part of the grouping key too (even though MT dominates in practice for this client,
it remains a safety net for the rare non-MT delivery rather than being dropped or
normalized away via a unit-conversion step). No code change resulted — both were
confirmations that the existing implementation is already correct.

## Capabilities and Constraints

- **Handover objective (confirmed with the client, 2026-08-25): the project ships to the
  client as a blank slate.** Structural setup (companies, sites with their real ISCC
  certificate data, and user accounts) stays as real, correctly-configured data the
  client logs into — but every operational/transactional record is wiped before
  handover: `Transaction`, `Batch`, `BatchMerge`, `ConversionEvent`, `ConversionLine`,
  `SchemeTransfer`, `Period`/`PeriodBalance`, `PhysicalStockReading`,
  `PhysicalDocument`, and `AuditLogEntry`. This includes the real 9-month KHPB
  historical worksheet data seeded via `seedKhpb.ts` (below) — it was valuable for
  development/testing, but is not part of what ships to the client. A standing
  objective, not yet acted on: no reset/export script exists yet, and the current dev
  database is left as-is for continued development and testing. Build the actual
  wipe/reset step as a separate, later task when the client is ready for handover —
  don't let this objective quietly turn into "avoid adding data now," since the dev
  database still needs realistic data to build and verify against in the meantime.
- **This is a real multi-tenant SaaS (confirmed with the client, 2026-08-25), not just a
  single-tenant Phase 1**: `SUPER_ADMIN` (ALS Solutions) manually onboards each paying
  client company (2-3 and growing, KHPB being the first) — no self-service registration,
  payment is handled entirely outside the app, `SUPER_ADMIN` just activates/deactivates a
  company's access (`Company.isActive`, now actually enforced at login, not just stored —
  see `companies.routes.ts` and `auth.routes.ts`'s login handler). `SUPER_ADMIN` also sets
  a per-company site quota (`Company.maxSites`, nullable = unlimited/not set yet), enforced
  in `sites.routes.ts`'s `POST /`. `SUPER_ADMIN`/`auth.routes.ts`'s user-management
  endpoints (`GET`/`POST`/`PATCH /users`) can now target any company, which is the actual
  mechanism for creating a new client's first `COMPANY_ADMIN`.
  **Still deliberately out of scope, confirmed explicitly**: `SUPER_ADMIN` does not get to
  browse another company's operational data (batches, transactions, periods) — every other
  route still filters strictly by the requester's own `companyId` regardless of role, and
  that's account management, not the "see all companies' data" reach the schema's own role
  note originally implied. Don't build that broader data-visibility version speculatively —
  it was explicitly turned down in favor of the narrower account-management scope above.
- **Company Profile module (2026-08-26)**: `COMPANY_ADMIN` can now view/edit their own
  company's identity directly — name, registration number, address, contact person/phone/
  email, and a logo — via `GET`/`PATCH /companies/me` and `POST /companies/me/logo`
  (`companies.routes.ts`). This is separate from the `SUPER_ADMIN`-only `/companies/:id`
  path added the day before: `/me` always operates on the caller's own company (no id is
  ever accepted), and its `PATCH` schema deliberately excludes `isActive`/`maxSites` — those
  stay `SUPER_ADMIN`-only, surfaced read-only via `GET /me` so a company can see its own
  quota usage (supports the existing "contact ALS to raise this limit" flow in
  `sites.routes.ts`). Logo upload is this backend's first file-upload feature — a new
  `multer` dependency, saved under `backend/uploads/logos/`, served statically at
  `/uploads/...` (`index.ts`). The module's sites + their ISCC certificates reuse the
  existing `sites.routes.ts` endpoints unchanged — no new API needed there.
  **Frontend not built in this pass** (per standing backend-focus practice): the module's
  page (company details, read-only account-status card, and the existing sites UI folded
  in) is drafted but not implemented — a separate decision for whoever builds the frontend
  side of this.
- Three roles only: `SUPER_ADMIN`, `COMPANY_ADMIN`, `COMPANY_USER` — all three can enter
  data; only the first two can close periods or manage users. There is no read-only /
  auditor role in this build.
- **KIV (2026-08-23): a revised account/role structure the user described**, partially
  built now, the rest still deferred pending more information — don't build the
  remainder speculatively:
  - `SUPER_ADMIN` (ALS Solutions) additionally fixes bugs (not an RBAC concern) and
    assigns each `COMPANY_ADMIN` a quota of how many sites they may create — **this part
    is now built** (2026-08-25: `Company.maxSites`, enforced in `sites.routes.ts`; see
    the multi-tenant SaaS bullet above). The "subcontractor companies" half of that
    original quota wording is still unresolved — see the open question below.
  - `COMPANY_ADMIN` ("main contractor") can create unlimited users, is capped on sites
    by `SUPER_ADMIN`'s quota (**built**), and approves data-change requests submitted by
    `USER` accounts (confirmed with the user 2026-08-23: `COMPANY_ADMIN` is the approver,
    not `SUPER_ADMIN` — **still not built**, no change-request-and-approval workflow
    exists; every role still writes directly and immediately, and the only correction
    mechanism is an offsetting entry, since the audit log is append-only).
  - `USER` ("subcontractor company") gets a `COMPANY_ADMIN`-assigned subset of
    functions (not just site scoping) and, if they book something wrong, must submit a
    change request rather than edit/delete it directly. **Still not built**: no per-user
    granular function permissions (today permissions are strictly role-based — every
    `COMPANY_USER` can do exactly what every other `COMPANY_USER` can do).
  - **Open and unresolved**: whether a `USER` account represents one whole subcontractor
    company (a new third company tier below `COMPANY_ADMIN`'s company) or is still an
    individual staff member merely reframed as "subcontractor staff" (a much smaller
    change, closer to the site-scoped `UserSiteAccess` RBAC already built 2026-08-22).
    The user will revisit this once they have more information — do not guess at an
    answer or build against either interpretation until they do.
- No automated matching against the official ISCC material list (material is free
  text), no IoT/sensor ingestion of physical stock readings (manual entry only), and no
  integration with an external certification-body system — all explicitly out of scope
  for this phase per the project proposal.
- Runs on XAMPP MySQL locally today; no production hosting decided yet.
- **Backend hardening (2026-08-22)**, all verified end-to-end against the real running
  API, not just typechecked: rate limiting (general in-memory + DB-backed login
  limiter), idempotency keys (6 mutating endpoints), application-level field encryption
  (AES-256-GCM, since this MariaDB build has no encryption plugin — see
  `fieldEncryption.ts`), a cache abstraction with explicit invalidation (in-memory
  today, swaps to real Redis via `REDIS_URL` once one exists), OAuth2/OIDC SSO
  (correct end-to-end, but not live until real provider credentials are set — see
  `oauth.ts`), a DB-backed job queue (standing in for a message broker; wired to a real
  "period closed" notification), a retry helper for transient DB errors, and load
  balancing via Node's `cluster` module (`CLUSTER_ENABLED` env var, off by default).
  Two real bugs were found and fixed while building this, not just anticipated: a
  missed encryption call site (the inline physical-document path inside
  `transactions.routes.ts`, separate from the standalone documents route), and — on
  this Windows dev machine specifically — forcing `cluster.schedulingPolicy = SCHED_RR`
  to fix uneven worker load distribution instead caused every worker to crash
  immediately, which combined with a naive refork-on-exit handler into a runaway
  process-spawning loop; both are documented in `index.ts`'s own comments (round-robin
  distribution across workers is simply not reliable on Windows — real multi-process
  resilience still holds, verified by killing a worker and confirming the API stayed
  up, just not even load spreading).

- **Client clarification pass (2026-08-22)**, applied from `References/Clarification.txt` plus updated official
  `ISCC_EU_material_list_2026_July.pdf` / `ISCC_PLUS_material_list_Aug_26-2.pdf`, all verified end-to-end against
  the real running API:
  - `Batch` gained `ghgValueType` (DDV/DV/AV, no app-level default -- always a deliberate choice), `materialCategory`
    (scheme-dependent controlled vocabulary: EU's Annex IX Part A/B/Other/Waste & Residues vs. PLUS's
    Bio/Bio-Circular/Circular/Renewable-energy-derived, validated at the Zod layer), `wasteStatus` (required only
    for Bio-Circular material), and `unit` (M3/METRIC_TONS/KG/M3_15C/J/KWH, defaults to M3) -- `unit` joined the
    `poolKey` pooling/grouping key (a pool's balance is a plain sum, only valid if every transaction shares one
    unit), so a second delivery in a different unit correctly forms a separate pool rather than erroring.
  - Confirmed the existing pooled-balance engine already implements ISCC's Credit Method in substance (the one
    methodology KHPB is actually certified under) -- no core formula rewrite was needed.
  - Period close: `conversionFactorCf` now defaults to 1 at a plain TRADER site (still required at a
    PROCESSING_UNIT site, which runs real conversions); `openingOutputInventoryB` now auto-populates from the
    previous period's real `creditsCarriedForward` when omitted (still overridable), closing the exact
    manual-re-entry risk flagged earlier this session.
  - `POST /batches/merge` gained a `ghgMode` choice (`WORST_CASE`, the original Rule 7 max-across-sources and
    still the default, or `ACTUAL`, a volume-weighted average) -- both are valid per the client, not right/wrong.
  - Site-scoped RBAC: a new `UserSiteAccess` join table scopes a `COMPANY_ADMIN`/`COMPANY_USER` to specific sites
    without adding a 4th role (the client's 3-tier hierarchy terminology didn't map cleanly onto the existing
    3-value `UserRole` enum -- see the git history/chat for that tension, resolved by layering scoping on top
    instead of reinterpreting the schema's authoritative role names). A user with no `UserSiteAccess` rows is
    unrestricted (unchanged default); one with rows is confined to those sites across sites/periods/transactions/
    conversions/scheme-transfers/stock-readings/batches/dashboard, and a scoped admin can only create or reassign
    users within their own site scope (verified this can't be used to self-escalate).
  - New `POST /scheme-transfers/plus-to-plus`: moves credits between two ISCC_PLUS sites (distinct from the
    existing EU->PLUS-only transfer), gated on both sites being ISCC_PLUS and being the same or a neighboring
    country (a small, real adjacency list for Malaysia's actual neighbors -- Thailand, Indonesia, Brunei,
    Singapore -- not a fabricated worldwide dataset).
  - Deliberately not built this pass (see the plan's own "out of scope" section): automatic periodic report
    generation, a methodology-lock preventing mid-period CF-approach changes, and EU pooling by RED III category.
  - Frontend not touched in this pass, per standing preference -- the Record Transaction, Pools, and Users pages
    don't yet expose the new fields/choices (`ghgValueType`/`materialCategory`/`wasteStatus`/`unit`, GHG merge
    mode, site assignment), so the API supports all of this before the UI does.

## Brand Commitments

The client supplied a binding color palette (recorded verbatim, already implemented as
CSS custom properties in `frontend/src/styles/global.css`): black/white sidebar with
orange (`#F26622`) as the sole accent and active-state color; light gray (`#F7F7F7`)
dashboard background with white cards; black-header data tables; and fixed status
colors (success `#2E7D32`, warning `#F9A825`, error `#D32F2F`, info `#1976D2`). This
palette is not open for revision by design work — it is product truth, not a design
recipe. The name "ISCC Mass Balance" / "ISCC Mass Balancer" and a circle-with-line
"dial" mark (from `prototype/ISCC Mass Balancer.dc.html`) are the current identity.

A client-supplied interactive prototype, `prototype/ISCC Mass Balancer.dc.html`,
additionally establishes page-level layout and interaction patterns (see DESIGN.md)
and covers some flows not yet built in the real app: a close-period modal with a
physical-stock tolerance check, a reject-with-trace error modal, a conversion-trace
modal, an audit before/after diff modal, toast notifications, and a period-continuity
strip with a "closed & locked" stamp. Treat it as authoritative for anything it
covers.

## Evidence on Hand

- `Mass-Balancer.MD` — original project brief.
- `References/Project Proposal & Quotation V2.pdf` — the commissioned scope.
- `References/mass_balance_engine.py`, `References/models.py`,
  `References/iscc_mass_balance_schema.dbml`, `References/Database Schema.pdf` — the
  authoritative business-logic and schema sources this build implements directly.
- `References/Appendix 5 - KHPB ISCC PLUS Mass Balance (MB) Worksheet (2024-2025) (1).xlsx`
  — real 9-month production history for one site, already seeded into the database.
- `References/260717 Appendix 5 - KHPB ISCC PLUS Mass Balance (MB) Worksheet (2025-2026) .xlsx`
  — the same site's continuation report. Reviewed, not yet seeded: its reporting
  template changed (no more "Biomethane Generated (m3)" / "Biomethane Supplied to
  Grid (m3)" columns, only upstream POME/biogas m3 figures and grid supply in
  MMBtu/MT), so it can't be mapped onto the existing m3-based ledger without either
  picking non-equivalent stages as inbound/outbound or inventing a unit conversion
  — neither of which should happen without the user's say-so. See chat for the
  open question.
- `References/Appendix 12a - ISCC EU Sustainability Declaration (v4.0_21 May 2025).xlsx`
  — the blank official ISCC EU Proof-of-Sustainability declaration template, not
  filled-in KHPB data. Its `RawMat` sheet (104 feedstock names) is a *non-exhaustive
  extract*, not the authoritative source — see Appendix 13a below, which corrects an
  omission this sheet caused. It does **not** contain a real GHG intensity figure
  for KHPB — the placeholder in `backend/prisma/seedKhpb.ts` stays a placeholder;
  a real number would come from a filled-in declaration (Appendix 12a/12b), which
  isn't in this folder.
- `References/Appendix 12b - ISCC PLUS Sustainability Declaration (v4.0_30 June 2026).pdf`
  — the blank official ISCC PLUS declaration template (6 pages), also not filled-in
  KHPB data. Reveals real methodology this build doesn't implement: named mass-balance
  options ("Attribution determined by mass" / "by energy" / a separate "Credit
  method"), a GHG component breakdown (`eec, el, ep, etd, eu, esca, eccs, eccr`) where
  this app stores one flat `ghgValue`, and a "compensation of input characteristics"
  mechanism for merged/pooled batches that may relate to (or differ from) this app's
  max-GHG-on-merge rule (Rule 7). None of this has been confirmed against KHPB's
  actual certificate scope — flagged as open questions for the client, not assumed.
- `References/Appendix 13a - ISCC EU Material List_June 2026.pdf` (36 pages) and
  `References/Appendix 13b - ISCC PLUS Material List_Feb 2026.pdf` (34 pages) — the
  true authoritative, obligatory-wording ISCC material lists (13a's own text: "It is
  obligatory to use the wording on this list on ISCC EU and ISCC PLUS certificates").
  Confirmed plain **"Palm oil mill effluent (POME)"** (KHPB's actual feedstock) is a
  real, distinct, valid entry on 13a — the Appendix 12a Excel sheet used to build the
  feedstock dropdown had omitted it, leaving only "POME oil" (a different residue
  stream; 13a states explicitly "POME Oil cannot be covered under the material entry
  of POME"). Restored in `TransactionsPage.tsx`, sourced from 13a now, not 12a. Also
  confirmed the official product spelling is **"Bio-LNG"** (hyphenated), corrected
  everywhere it was hardcoded as "BioLNG" in the frontend (the `BIOLNG` enum/API value
  itself is unchanged — this was a display-string fix only). 13b additionally defines
  a product-category prefix system (`bio` / `bio-circular` / `circular` /
  `renewable-energy-derived`) that determines how a product must be declared on an
  ISCC PLUS certificate annex — for KHPB, since POME is a biological-origin
  waste/residue, the correct prefix would be **`bio-circular`**, not plain `bio`. This
  app has no field for that prefix at all; not added without confirming with the
  client first, since it's a schema change, not a copy fix.
- No marketing copy, testimonials, pricing, or external screenshots exist for this
  product — it is an internal operations tool, not something with a public presence.
  Future design work must not fabricate any of these.

## Product Principles

1. Compliance is enforced, not suggested — every rule from the problem statement is a
   hard server-side check with a plain-English rejection reason, never just a UI hint.
2. Every accepted write is permanently traceable — the audit log is append-only with no
   update/delete path anywhere in the API.
3. Numbers over decoration — this is an Operate-mode tool for people who need to scan
   balances and close periods correctly, not a marketing surface; clarity and
   correctness always outrank visual flourish.
4. The schema and business rules are ported directly from the client's own reference
   documents, not reinvented — when in doubt, the References folder is authoritative.

## Accessibility & Inclusion

No accessibility standard was specified by the client. Given this is a compliance tool
used daily by operations staff (not a public-facing site), treat WCAG 2.1 AA as the
working bar (contrast, focus states, keyboard operability) unless the client specifies
otherwise.
