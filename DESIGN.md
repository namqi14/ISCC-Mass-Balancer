---
name: ISCC Mass Balancer
description: Internal ledger for ISCC EU/PLUS biomethane and BioLNG mass balance bookkeeping.
colors:
  ink: "#111111"
  sidebar-black: "#000000"
  paper: "#ffffff"
  canvas: "#f7f7f7"
  border-hairline: "#e5e5e5"
  muted: "#6b6b6b"
  faint: "#9c9c9c"
  brand-orange: "#f26622"
  brand-orange-deep: "#c94f16"
  sidebar-text-dim: "rgba(255, 255, 255, 0.55)"
  table-row-hover: "#fff0e8"
  success: "#2e7d32"
  warning: "#f9a825"
  warning-ink: "#96690e"
  error: "#d32f2f"
  info: "#1976d2"
typography:
  display:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  headline:
    fontFamily: "Roboto Slab, serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Roboto Slab, serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Roboto Condensed, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand-orange}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-primary-hover:
    backgroundColor: "{colors.brand-orange-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "18px"
  stat-card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  page-header:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    padding: "24px 24px 20px"
---

# Design System: ISCC Mass Balancer

## Overview

**Creative North Star: "The Weighbridge Ledger"**

This is the system a compliance clerk keeps open all day to book deliveries, run
conversions, and close ISCC balancing periods before an audit — not a marketing
surface, and not a generic admin-panel template. The reference object is the physical
artifact this software replaces: a certified weighbridge ticket and a paper mass
balance ledger. Ink-black structure (the page header banner, sidebar, table headers)
reads as the stamped, official parts of the record; the single orange accent — the
client's brand color, non-negotiable — marks what's active, actionable, or in
progress, the way a certification stamp or a hazard placard marks a document. Numbers
keep tabular alignment everywhere (via `font-variant-numeric: tabular-nums`, not a
dedicated monospace face) like ledger columns that must line up. The system is flat
and dense at rest — no ambient shadows, no decorative gradients — because in this
domain, confidence comes from a number holding still on the page, not from a flourish.

This is the second design pass on this app. The first (documented in git history via
this same file) was driven by `npx impeccable install`'s anti-pattern detector and
fixed a flat type hierarchy and sub-11px functional text. This second pass replaces
that pass's typography and page-header treatment with the client-supplied prototype at
`prototype/ISCC Mass Balancer.dc.html` — an interactive mockup covering every screen in
the app plus several flows this build didn't have yet (a live pre-submit rule check on
the transaction form, close-period and audit-diff modals, a period-continuity strip).
Where the prototype conflicts with the detector's generic heuristics (it does, on two
points — see Named Rules below), **the prototype wins**: it is client-supplied,
specific design direction, not a generic best-practice default.

**Key Characteristics:**
- Ink-black structure with one orange accent, never orange-on-orange decoration.
- A full-bleed dark banner opens every page: orange eyebrow label, serif headline,
  dim subtitle, optional primary action on the right.
- Five-font system, each with exactly one job: Roboto Slab for headings, DM Sans for
  the brand mark and hero stat numbers only, Inter for body/nav/buttons, Roboto
  Condensed for uppercase micro-labels, Roboto for tabular data text.
- Flat at rest; a shadow only ever appears as a hover/focus response, never ambient.
- Motion is a confirmation, not a performance: fast, small, purposeful.

## Colors

One brand accent, deployed like a stamp, not a wash — most of any screen is ink,
paper, and hairline gray.

### Primary
- **Brand Orange** (`#F26622`): the sole accent — active nav item, primary buttons,
  focus rings, selected states, the sidebar mark, the page-header's bottom border.
  Client-mandated, verbatim.
- **Brand Orange, Deep** (`#C94F16`): the primary button hover state, and the color
  orange-colored **text** uses on a light background (active tab label, selected
  radio-option label). Raw `#F26622` text on white measures 3.1:1 (fails WCAG AA);
  `#C94F16` measures ≈4.8:1 and passes. Same hue family, so it reads as "the brand
  color," just legible as text.

### Neutral
- **Ink** (`#111111`): headings, primary text, table headers and the page-header
  banner (as a fill).
- **Sidebar Black** (`#000000`): the sidebar surface only.
- **Paper** (`#FFFFFF`): cards, table rows, button-secondary fill.
- **Canvas** (`#F7F7F7`): page background, alternating table rows, raised sub-surfaces.
- **Border Hairline** (`#E5E5E5`): the only border color in the system.
- **Muted** (`#6B6B6B`): secondary text (subtitles, hints at body size). Passes AA on
  white (~5.7:1) — use this, not Faint, for any real informational text.
- **Faint** (`#9C9C9C`): placeholder text only. At 2.7:1 on white it fails AA for real
  content, so it is never used for anything a user needs to read to use the page.

### Named Rules
**The One Accent Rule.** Orange is the only saturated color in the system. Status
colors (success/warning/error/info) exist solely to mark transaction/alert state, are
never used decoratively, and never compete with orange for attention on the same element.

**The Documented Exceptions.** Two of Impeccable's detector findings are accepted, not
fixed, because they come directly from the client-supplied prototype rather than from
this build's own drift:
1. `#FFFFFF` text on `#F26622` (primary buttons, active sidebar item) measures 3.1:1
   against WCAG AA's 4.5:1 threshold. This is the client's literal palette
   (`Background: #F26622 / Text: #FFFFFF`) for exactly these two roles. Not extended
   anywhere else — every other orange-on-light or white-on-orange text pairing uses
   `#C94F16` instead, which passes.
2. The page-header's 3px solid bottom border trips the detector's `side-tab` rule
   ("thick colored border on one side of a card — the most recognizable AI-UI tell").
   It's in the prototype verbatim (`border-bottom: 3px solid #F26622` under the black
   header bar) and reads as a certification stamp's edge here, not a generic accent
   border on a content card — kept as specified.
Do not "fix" either by silently changing the token or removing the border; both are
intentional client design direction, not oversights.

## Typography

**Headings (Roboto Slab):** the page-header's `h1`, panel `h2` headings, modal titles.
A slab serif reads closer to a stamped letterhead than a startup landing page.
**Brand / hero numbers (DM Sans):** the sidebar/login wordmark and the large KPI
numbers on stat cards only — the two places the interface is allowed a second display
identity, both financial or brand in nature.
**Body / nav / buttons (Inter):** base text, sidebar nav labels, button labels, form
input text.
**Uppercase micro-labels (Roboto Condensed):** nav section labels, table column
headers, field labels, badges, stat-card and pool captions — anything short, uppercase,
and letter-spaced.
**Tabular data (Roboto):** dates, quantities, IDs in tables and pool metrics. Paired
with the body's global `font-variant-numeric: tabular-nums` so digits stay aligned as
they change, without needing a dedicated monospace face.

### Hierarchy
- **Headline** (700, 28px, 1.15, Roboto Slab, white): the page-header title. Sits in
  the dark banner every page opens with, under an orange eyebrow label and above a
  dimmed-white subtitle.
- **Display** (700, 28px, 1.15, DM Sans): the large KPI numbers on stat cards — sites,
  open periods, pool count, biomethane/BioLNG balance.
- **Title** (600, 16px, 1.3, Roboto Slab): panel headings (`.panel h2`).
- **Body** (400, 14px, 1.5, Inter): base text, form inputs, table data cells.
- **Label** (600, 11px, uppercase, 0.05em tracking, Roboto Condensed): every
  functional micro-label. 11px is the hard floor, with no exceptions — raised here
  from a 10–10.5px floor the detector flagged on every page in the prior pass.

### Named Rules
**The 11px Floor Rule.** No functional (non-decorative) text renders below 11px,
anywhere, ever — not even inside a footer or a dense table. If a label needs to be
smaller than that to fit, the layout is wrong, not the font size.

**The One Job Per Font Rule.** Each of the five faces has exactly one role (headings /
brand-numbers / body / labels / data). None of them substitutes for another, even
when a component feels like it needs "a bit more character" — reach for weight or
size within the assigned face first.

## Layout

A single main content column (max 1240px) beside a fixed 224px black sidebar; no
secondary right rail. Density is intentionally high — this is a daily-use operations
tool, not a marketing page — but the spacing scale below replaces ad hoc pixel values
so density stays a deliberate choice, not an accident:

`xs 4px · sm 8px · md 12px · lg 16px · xl 20px · 2xl 24px · 3xl 32px`

Every page opens with a full-bleed page-header banner (negative-margined to cancel the
content column's own padding, then restating `2xl`/`lg` padding inside) before the
regular padded content resumes. Cards/panels stack with `md` gaps; form grids use `md`
gutters. The transaction entry screen is the one page with a secondary column (a
`1.4fr / 1fr` split for the form and its live rule-check sidecar); both grid tracks
use `minmax(0, …)` so a wide form-grid can't blow out its track and crush the sidecar
column, and the split collapses to one column below 1400px of content width, since a
224px sidebar plus a 4-column form-grid plus a sidecar genuinely doesn't fit a typical
1280–1366px laptop viewport. Responsive behavior is otherwise minimal by design (this
is an internal desktop tool used at a desk, not in the field), but the existing
`@media (max-width: 900px)` form-grid collapse is preserved.

## Elevation & Depth

Flat by default, with tonal layering (`canvas` vs `paper`) doing the depth work that
shadows would otherwise do. A restrained two-step shadow vocabulary exists, used
*only* as a response to interaction, never at rest.

### Shadow Vocabulary
- **Resting** (`none`): every card, panel, and stat card sits flush with a 1px
  `border-hairline` border and no shadow. This is the default for 100% of surfaces.
- **Hover/Focus** (`box-shadow: 0 4px 12px rgba(17,17,17,0.08)`): applied only on
  hover to interactive cards (pool rows, stat cards; nav items get a background shift
  instead) to signal "this responds to you," then removed on mouse-out.

### Named Rules
**The Flat-By-Default Rule.** A shadow appearing on a surface at rest is a bug, not a
style choice — depth here communicates interactivity, not decoration.

## Shapes

Two corner radii cover the whole system: `sm` (6px) for anything you click or type
into (buttons, inputs, radio options), `md` (10px) for anything you read inside
(cards, panels, stat cards, pool blocks). `lg` (14px) is reserved for the login card,
the one surface allowed to feel slightly softer since it isn't part of the working
desk. Badges use `pill` (fully rounded) — the one deliberately different shape in the
system, so a badge never gets mistaken for a button.

## Components

### Page Header
- **Style:** full-bleed `ink` banner, 3px `brand-orange` bottom border (see Documented
  Exceptions). Orange Roboto Condensed eyebrow ("Mass balance register") above a white
  Roboto Slab headline and a dimmed-white subtitle; an optional primary action sits
  right-aligned, vertically centered with the title block.
- **Implementation:** a shared `<PageHeader title subtitle action />` component
  (`frontend/src/components/Ui.tsx`) every page calls, rather than each page
  duplicating the banner markup.

### Buttons
- **Shape:** `sm` radius (6px), never pill.
- **Primary:** `#F26622` fill, white text, 600 weight, 9px/18px padding. Hover darkens
  to `#C94F16`.
- **Hover / Focus:** background transition only (0.15s); a visible `focus-visible`
  outline in `#C94F16`.
- **Secondary / Ghost:** white fill, hairline border, ink text; hover drops to
  `canvas` fill with a darkened border.

### Cards / Containers
- **Corner Style:** `md` (10px), normalized across `.panel`, `.stat-card`, `.pool`.
- **Background:** `paper` on `canvas`.
- **Shadow Strategy:** none at rest; see Elevation & Depth.
- **Border:** 1px `border-hairline`, always.
- **Internal Padding:** `lg`–`xl` depending on density need.

### Inputs / Fields
- **Style:** `canvas` fill, hairline border, `sm` radius, 14px body text.
- **Focus:** border shifts to `#F26622` plus a soft `0 0 0 3px rgba(242,102,34,0.15)`
  focus ring, so keyboard/tab users get the same unambiguous "you are here" signal
  mouse users get from hover states.

### Navigation (Sidebar)
- **Style:** black fill, white text at rest, `#F26622` fill with white text when
  active (the one place white-on-orange text is intentional).
- Each nav item has its own small (16px) inline SVG icon — stroke-based, 1.75px
  stroke, `currentColor`, so they inherit the white/orange text color automatically.
- **Brand mark:** a circle-with-vertical-line "dial" glyph (from the prototype),
  used identically on the sidebar and the login screen — not the earlier leaf mark.

### Data Tables
- **Header:** `ink` fill, white text, `label` typography (11px, uppercase, 600), with
  a 1px `rgba(255,255,255,0.16)` divider between header cells.
- **Rows:** `paper`/`canvas` alternating, with a 1px `#F0F0F0` divider between cells.
- **Hover:** `table-row-hover` (`#FFF0E8`) background plus a `3px` inset `brand-orange`
  left accent bar — a hover response, not a resting `side-tab` (see Documented
  Exceptions: the distinction the detector's rule is actually protecting against is
  ambient decoration, not an interaction cue).
- **Numeric columns:** right-aligned, `data` typography (Roboto, tabular-nums).

### Pre-Submit Rule Check (signature component)
Ported from the prototype's New Transaction screen and genuinely wired to this app's
real data, not a static mock: a sidecar panel next to the transaction form
(`TransactionsPage.tsx`) that evaluates Rules 1, 2, 3, 5, 7, and 8 against the current
form state. Each row is one of three tones, never faked:
- **`ok`** (green tint, `OK` mark): verified true from data already on the page — e.g.
  Rule 5's balance check compares the entered quantity against the selected pool's
  real `availableVolume`.
- **`fail`** (red tint, `STOP` mark): a genuine violation the client already knows
  about, e.g. quantity exceeds the pool's available balance.
- **`pending`** (gray, `···` mark): not yet determinable from the form (missing
  field) or only checkable server-side (worst-case GHG on merge, stock tolerance at
  close) — never shown as a false pass.
A companion "Resulting pool balance" panel shows the real available-now /
this-delivery / after-this-entry numbers for outbound entries; inbound entries get an
honest note instead ("resolved server-side, not shown here in advance") since which
pool an inbound entry joins isn't known until the server matches it.

### Empty / Loading States
- Loading uses a subtle skeleton-row pulse instead of a single static "Loading…" line;
  empty states keep a title/subtitle pattern with a small on-brand outline icon.

## Do's and Don'ts

### Do:
- **Do** keep the client's palette values byte-for-byte identical — apply them
  differently (sizing, hierarchy, which text gets which shade), never change the hex.
- **Do** use `#C94F16` for any new orange **text** on a light background; reserve raw
  `#F26622` text-on-light for the two Documented Exceptions.
- **Do** keep every functional label at 11px or above; run the detector
  (`node .claude/skills/impeccable/scripts/detect.mjs <url-or-file>`) after any new
  page before shipping it, and treat a `side-tab` or `overused-font` finding on
  something copied from `prototype/ISCC Mass Balancer.dc.html` as expected, not a bug.
- **Do** give data/ledger text `font-variant-numeric: tabular-nums` (inherited from
  `body` already) rather than reaching for a monospace face.
- **Do** check `prototype/ISCC Mass Balancer.dc.html` before inventing a new page or
  component treatment — it covers screens this build hasn't fully implemented yet
  (close-period modal with tolerance check, reject-with-trace modal, conversion-trace
  modal, audit before/after diff modal, toast notifications, a period-continuity strip
  with a "closed & locked" stamp on fully-closed periods).

### Don't:
- **Don't** add a second accent color. If something needs to stand out, use size,
  weight, or the existing status colors — never a new hue.
- **Don't** add ambient shadows to a resting card, panel, or stat card.
- **Don't** mix fonts outside their assigned role (Roboto Slab for headings, DM Sans
  for brand/hero numbers, Inter for body/nav/buttons, Roboto Condensed for uppercase
  labels, Roboto for tabular data).
- **Don't** let page-subtitle copy lean on em dashes as a crutch — prefer a period,
  comma, or parenthetical. (Table cells' `—` for a null/empty value are a different,
  legitimate convention and are not part of this rule.)
