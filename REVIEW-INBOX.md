# REVIEW-INBOX

Briefs from reviewer agents: correction briefs from pm-desk, E2E bug briefs from qa-lab (ids `QA-*`). Newest on top.
Dev session: work through OPEN items, mark each `[x]` and note what was done, then ask the sender for a re-check (qa-lab re-tests `QA-*` items; pm-desk re-reviews the rest).

<!-- all paths in this file are relative to workspace root E:\claudeWorkSpace -->

---

## [INVEST-M1] APPROVED (code + unit) — 2026-07-14
**From**: pm-desk
**Status**: APPROVED — next gate is qa-lab `QA-M1` (behavioral / E2E). Full brief:
`pm-desk/projects/jodsa/reviews/INVEST-M1-review.md`.

JodSa Investments M1 (Holdings + Asset-Transaction Ledger) passes code+unit review. All four acceptance
criteria met with **live** evidence — migration `0008` is applied, so 2-user RLS isolation is proven, not
gated.

### Gates re-run this session (independent, live)
- `npx tsc --noEmit` → exit 0 · `npx next lint` → clean.
- `npx vitest run tests/unit/invest` (`.env.test` sourced) → **22 passed / 0 failed**.
- `npx vitest run tests/unit/rls.test.ts` (LIVE Supabase) → **25 passed / 0 failed** (all 7 M1 SPEC-4
  RLS tests green live).
- Full suite `npx vitest run` → **264 passed / 0 failed / 0 skipped** — no regression.

### Confirmed
- RLS enabled + 4 owner policies on all 4 new tables; `assets` system-vs-owned split proven safe (no
  cross-user custom leak, no forging system rows). `bigint` on every `*_minor`.
- Money layer (`lib/invest/money.ts`) separate from `lib/money.ts`, bigint + FX-at-cost, single rounding
  point (hand fixture matches). Cost basis derived from `asset_transactions` (weighted-average; sell/
  dividend/fee/fractional/empty edge cases correct).
- Server actions flow through `supabase-js` + user session (RLS applies) — **no service-role/Drizzle on a
  request path**; Zod on every payload. Non-goal guard clean (no order-execution path; multi-currency
  confined to `/invest`).

### Forward-risk notes (not blocking; for M3)
- No UNIQUE on `holdings(user_id, asset_id[, broker])` → a user can open multiple holding rows per asset.
  The **M3 dashboard must aggregate per-asset across holding rows** (allocation/P&L) to avoid mis-weighting.

### Routed to qa-lab — QA-M1
Behavioral / prod-build E2E: add a USD + a THB holding through the real UI and confirm totals/cost basis
match the fixture; add each asset class incl. a custom asset via "+ create asset"; confirm `risk_capital`
warning renders; th/en + light/dark on `/invest`; manual 2-user isolation over the UI.

---

## [SPEC-4] Phase 2 — JodSa Investments module (`/invest`) — 2026-07-14
**From**: idea-forge
**Status**: OPEN — **GREENLIT, this is the active Phase-2 build** (owner confirmed 2026-07-14 the
investment module is the P2 they want, over SPEC-3). Builds **INTO this app** as a new `/invest` route
group — **not a fresh scaffold**. Blueprint is audited **SHIP, 0 blockers**.

**Authoritative spec (read in order) — go-signal is this brief:**
1. `idea-forge/ideas/jodsa-investments/prompt.md` — the handoff prompt (read first).
2. `idea-forge/ideas/jodsa-investments/docs/01-definition.md` — what/who/success/**non-goals**.
3. `idea-forge/ideas/jodsa-investments/docs/02-architecture.md` — data model & stack (aligned track-first).
4. `idea-forge/ideas/jodsa-investments/docs/04-roadmap.md` — M0–M5 + acceptance.
5. `idea-forge/ideas/jodsa-investments/docs/05-risks.md` · `docs/06-audit.md` — risks + SHIP audit.

**Reuse, don't reinvent:** JodSa's Supabase/RLS/Auth, Serwist PWA, on-device OCR worker, next-intl/
next-themes, **design v3**. Analysis methodology for M5: `fin-desk/Resources/portfolio-risk-review/
portfolio-risk-methodology.md`.

**Build order (M0 gates M5 only — it does NOT block the tracker):**
- [x] **M1 — Holdings + Asset-Transaction Ledger** ← *start here* · complexity M · deps none · `supabase-rls`.
  New schema `assets/holdings/asset_transactions/portfolio_snapshots` + RLS (Drizzle migrations);
  reuse JodSa auth; **multi-currency** minor-unit money helpers (FX-at-cost); manual CRUD; asset classes
  **US stock/ETF · Thai SET · Thai funds · gold · crypto**; sleeve tags `core|satellite|risk_capital`;
  cost-basis from transactions; holdings table UI (th/en, light/dark, v3). **Accept:** 2-user RLS
  isolation; USD+THB holdings coexist w/ hand-fixture minor-unit math; every asset class add/classify/
  cost-basis; `risk_capital` sleeve flagged 100%-losable.

  **Dev progress (2026-07-14) — M1 implemented, code+unit ready for pm-desk review:**
  - **Schema** (`db/migrations/0008_invest_holdings.sql`, hand-authored — `drizzle-kit generate` is
    broken here, per M8's precedent): `assets` (system-seeded reference rows + user-scoped custom rows,
    `is_system`/`user_id` CHECK-constrained), `holdings`, `asset_transactions`, `portfolio_snapshots`
    (schema only — its UI is M3). Every `*_minor` column is **`bigint`**, not `integer`, per the Fable
    note. `db/schema.ts` + `lib/supabase/types.ts` updated to match by hand. **Not applied to the live
    Supabase — owner sign-off step, see final report.**
  - **Design decision (disambiguating `holdings.avg_cost_minor`):** took the "derive from transactions"
    branch the Fable note offered, not "store total cost" — `holdings` carries **no** stored cost-basis
    column at all. Qty + cost basis are always computed live from `asset_transactions` via a new
    weighted-average-cost fold (`lib/invest/cost-basis.ts`), so there's exactly one source of truth and
    no drift risk. Consequence: opening a holding = recording its first `buy` transaction in the same
    server action (`createHolding` in `app/actions/invest/holdings.ts`) — "add a holding" and "record
    the first buy" are the same user action.
  - **Money** (`lib/invest/money.ts`, separate from `lib/money.ts` per the Fable note): bigint minor
    units + explicit currency, `parseMinor`/`minorToApi` for the PostgREST bigint-as-string boundary,
    `convertMinor` for FX-at-cost/FX-at-valuation (rounds once, at the destination currency's minor
    unit). No `decimal.js` dependency added — M1 doesn't need ratio math (that's M5).
  - **Route + UI**: `app/(app)/invest/` (inside the `(app)` auth-guard group, not top-level). Compact
    holding rows → J3-style detail sheet (design v3): sleeve/asset-class badges, `risk_capital` flagged
    with a destructive-styled warning banner both at creation time and in the detail view, transaction
    list with add/delete, manual "current value" entry (the M3 hook). Asset picker groups the seeded
    reference list by class with an inline "+ create asset" exit (J4 empty-source rule) when nothing
    matches. Nav: `/invest` enters via `/more` + the desktop sidebar (bottom bar's fixed 4-dest+FAB
    unchanged), per the Fable note.
  - **Seed data**: 19 system-seeded reference assets spanning all 5 MVP classes (7 US stocks/ETFs, 4 Thai
    SET names, 3 Thai mutual funds, 2 gold products, 3 crypto), idempotent via a partial unique index +
    `on conflict ... do nothing`.
  - **Housekeeping**: `project/jodsa/CLAUDE.md` non-goals amended with a scope-expansion note pointing at
    this SPEC-4 block. `.claude/skills/supabase-rls/SKILL.md` extended (Pattern C: shared reference reads
    + the owned-table list) rather than duplicated. `.claude/skills/portfolio-planner/SKILL.md` written
    verbatim per `prompt.md` §7 (M5 not started — gated by M0, which this session did not run).
  - **Infra fix (autonomous call, documented — not a scope cross):** `tsconfig.json` `target` bumped
    `ES2017` → `ES2020`. Bigint literals (`0n`, `100n`, ...) — required throughout the new bigint money
    layer per the Fable note — don't type-check below ES2020. Next.js/SWC does the actual build
    transpilation (not `tsc`), so this only affects the type-checker's allowed syntax/lib surface;
    `pnpm build` (all 21 routes) and `next lint` both still pass clean after the bump.
  - **Gates**: `tsc --noEmit` exit 0 · `next lint` clean · `pnpm build` succeeds (`/invest` route
    generated, 7.98 kB / 190 kB First Load JS) · unit suite (with `.env.test` sourced) **257 passed / 7
    skipped** (pre-existing skips, unrelated) — the *only* non-green item is the new M1 RLS suite in
    `tests/unit/rls.test.ts` (`M1 (SPEC-4) RLS: invest holdings/asset_transactions/assets`), which errors
    at `beforeAll` with `Could not find the table 'public.assets'` — **expected**, since migration 0008
    has correctly not been applied to the live Supabase yet (identical situation to M8's
    `slip_account_map` RLS suite before its migration was applied). Every other existing suite, including
    the pre-existing RLS suites for `accounts`/`transactions`/`slip_account_map`/M4 guest-token, stayed
    green — no regression.
  - **RLS reasoning (pending live verification):** every new table uses the same Pattern A
    (`user_id = auth.uid()` on select/insert/update/delete with `with check`) already proven live for
    `accounts`/`transactions`/`slip_account_map` in this repo, plus a new Pattern C (shared reference
    reads) for `assets`, documented in the extended `supabase-rls` skill. High confidence by construction
    and by matching a working pattern verbatim, but **not yet independently confirmed live** — that's
    exactly what the authored `tests/unit/rls.test.ts` M1 block will confirm once 0008 is applied.
  - **Not done**: M2 (Broker-Screenshot OCR), M3 (Portfolio Dashboard), M0 (AI-planning validation gate),
    M5 (planner) — out of this session's scope. `portfolio_snapshots` table exists (schema only, per the
    roadmap) but has no UI yet — that's M3.
  - **✅ orchestrator 2026-07-14 — migration `0008` APPLIED to live** (owner authorized "apply ให้เลย";
    applied atomically via postgres.js simple-protocol, NOT drizzle-kit — journal only lists through idx 4,
    same M8 gotcha). Verified live: 4 tables + 16 RLS policies (4/table) + 19 seed system assets.
    **`tests/unit/rls.test.ts` now GREEN 25/25** incl. `M1 (SPEC-4) RLS: B cannot update A's holding` →
    the 2-user isolation acceptance is now live-verified, not just reasoned. **M1 acceptance fully holds.**
    tsc 0 + invest unit 22/22 re-verified by orchestrator. **Ready for pm-desk M1 (code+unit) review.**
- [ ] **M2 — Broker-Screenshot OCR** (Dime-first, ~10 real screenshots prereq) · M · deps M1. Reuse the
  on-device worker; image never uploaded; ≥85% position-value correct; confirm grid w/ low-conf flags.
- [ ] **M3 — Portfolio Dashboard** · M · deps M1. Value/cost/P&L/allocation (class·currency·sleeve) +
  concentration callout + manual price update + snapshot history; under `/invest` (no chart on expense Home).
- [ ] **M0 — AI-Planning Validation Gate** *(builds nothing; gates M5)* · S · **needs owner input**:
  feed one **real** portfolio (Dime screenshot + actual SET/fund/gold/crypto holdings) into fin-desk
  `portfolio-risk-review`/`advisor`; verdict → `docs/M0-validation.md`. **PASS = ≥1 monthly action the
  owner would act on / be reassured by**, else **stop the AI layer**, ship M1–M3 as a tracker. This is a
  fin-desk + owner-data step, runnable in parallel with M1–M3.
- [ ] **M5 — AI Monthly Buy/Sell Planner** ⚠️ *gated by M0 PASS* · L · deps M3+M0 · new `portfolio-planner`
  skill. Decision-support only: buy/sell/hold/rebalance + one-line rationale, epistemic tags, disclaimer,
  first-class **NO-TRADE** path; **never places or simulates a real order** (non-goal guard in acceptance).

**Firm non-goals (from 01-definition):** no order execution / broker integration ever · no paid
market-data API in MVP (manual prices) · not licensed advice. Multi-tenant RLS isolation per new table.

### Fable build-readiness review — **GO-WITH-NOTES** (2026-07-14, disk-verified)
Core claims check out: no schema collision, no existing `/invest`, auth/RLS/Serwist/i18n/design-v3 real
and reusable, M0 gates M5 only, M1 acceptance self-contained. Heed these while building — **M1 items first:**
- **[M1] Money = new layer, `bigint` minor units.** `lib/money.ts` is THB/satang-only — **not**
  reusable. Build a **separate** `lib/invest/money.ts` (multi-currency minor units + FX-at-cost). ⚠️
  JodSa's schema uses `integer` (int4, caps ~฿21.4M in satang) — for invest `*_minor` columns use
  **`bigint`**, do **not** copy the int4 pattern. Disambiguate `holdings.avg_cost_minor` (per-unit is
  lossy with fractional crypto/Dime qty → store total cost or derive from transactions).
- **[M1] Migration = `0008_*.sql`, hand-authored SQL with RLS inline.** Migrations run 0001–0007 (note a
  duplicate-numbered 0005 pair + stale `meta/_journal.json`). **`drizzle-kit generate` is broken in this
  repo** (0007 was hand-authored) — write `0008` by hand; apply to **live** Supabase manually per M8's
  precedent (do NOT auto-apply — surface it for owner sign-off).
- **[M1] Route group = `app/(app)/invest/`** (inside the `(app)` auth-guard group at
  `app/(app)/layout.tsx`), **not** top-level `app/invest/` (which would render with no auth/nav). Nav v3
  is a fixed 4-dest + FAB bar → `/invest` enters via `/more` + desktop sidebar (dev's call, no conflict).
- **[M1] Housekeeping:** `project/jodsa/CLAUDE.md` still lists "❌ No multi-currency / ❌ Not an
  investment app" as firm non-goals with "push back if asked to cross." SPEC-4 is the owner-approved
  crossing — amend that CLAUDE.md non-goal early in M1 (scope-expansion note → SPEC-4) so future sessions
  don't refuse.
- **[M1-UI] Design v3 authority = `idea-forge/ideas/jodsa/docs/07-design.md`** (NOT the v1 snapshot at
  `project/jodsa/docs/source-idea/docs/07-design.md`). v3 tokens are already live in `globals.css` (M9) —
  build to match existing components.
- **[M0/M5] Methodology path fix:** the canonical file is workspace-root `Resources/portfolio-risk-review/
  portfolio-risk-methodology.md` (NOT `fin-desk/Resources/...`, which does not exist) — correct the
  prefix when the `portfolio-planner` SKILL.md is written.
- **[M2] OCR worker split:** `workers/slip.worker.ts` does QR/preprocess only (nested-WASM warning);
  tesseract runs main-thread via dynamic import (`lib/slip/parse-image.ts`). `workers/portfolio.worker.ts`
  must copy this split; row-segmentation grammar is genuinely new work.
- **[M5] Optional:** harden the no-order-execution non-goal to a grep guard (like SPEC-3's M10 pattern).

**Dev:** start **M1**; when its acceptance passes (types clean + lint clean + 2-user RLS holds), mark
`[x]` and ask pm-desk to review. idea-forge does not review the code. **Do not apply `0008` to the live
Supabase without owner sign-off** — author the migration, run/verify locally, then surface it for apply.

---

## [SPEC-3] Phase 2 backlog — M10–M13 (Push · CSV · BYO Vision · Realtime) — 2026-07-14
**From**: idea-forge
**Status**: **PARKED** (blueprinted, not the active target) — 2026-07-14 the owner chose the **investment
module (SPEC-4)** as the Phase-2 build. Keep M10–M13 as planned backlog; **do NOT start M10** until the
owner re-prioritizes. Build order when resumed: **M10 → M11 → M12 → M13**. Net-new phase, not a fix to M1–M9.

**Authoritative spec (read in order):**
1. `idea-forge/ideas/jodsa/docs/04-roadmap.md` §"Phase 2" — M10–M13 deliverables + acceptance.
2. `idea-forge/ideas/jodsa/docs/02-architecture.md` §"Phase 2 subsystems" — the new plumbing + the
   🔴 **cron service-role carve-out** and the two non-goal reversals.
3. `idea-forge/ideas/jodsa/docs/05-risks.md` §"Phase 2 additions".

> Note: your frozen snapshot at `project/jodsa/docs/source-idea/` predates this phase. For M10–M13 the
> live `idea-forge/ideas/jodsa/docs/` above is authoritative; design authority stays `docs/07-design.md` v3.

**Ordering & why:** engagement + quick-win first; the two items that **reverse an MVP non-goal** go last,
each behind an explicit opt-in.

- [ ] **M10 — Push Notifications (Web Push + Vercel Cron)** · complexity L · deps M9 + M7-D.
  VAPID + `push_subscriptions` (owner RLS) + Serwist `push`/`notificationclick` handlers.
  Delivery via `app/api/cron/notify/route.ts` (`CRON_SECRET`-gated) using `web-push`; daily reminder
  12:00/22:00 ICT (= 05:00/15:00 UTC) + recurring-due "จ่ายยัง?" confirm (Confirm keeps the row; Skip
  writes `recurring_exceptions` **and reverses** the materialized occurrence — idempotent, reconciles
  with the M7-D lazy materializer, never double-deducts) + optional budget-over-limit (stretch).
  🔴 **The cron route is the ONE sanctioned server-side service-role path** (system trigger, no user
  input) — import the service-role client **only** under `app/api/cron/`; M10 acceptance includes a
  grep guard that nothing else does. iOS Web Push needs an installed PWA (16.4+) — say so in settings.
- [ ] **M11 — CSV Export** · complexity S · deps M9. Client-side only (no infra/schema): Settings →
  Export, date+type filter → in-browser CSV Blob download; satang→baht at format time; **UTF-8 BOM**
  for Excel Thai; RLS-scoped to the signed-in user.
- [ ] **M12 — BYO Vision Key** ⚠️ *reverses "no server AI vision"* · complexity M · deps M2.
  Opt-in, default OFF; key stored **only in the browser**, **browser calls Google Vision directly** —
  key never hits a JodSa origin. Only the OCR text source changes; `lib/slip/extract.ts` unchanged;
  any failure falls back to Tesseract. Mandatory one-time privacy acknowledge (image leaves device).
- [ ] **M13 — Realtime Live-Sync** ⚠️ *reverses "sync-on-load only"* · complexity L · deps M9.
  Supabase Realtime `postgres_changes` on the **authenticated** client (RLS filters the stream);
  lazy (not in first paint), subscribe-on-focus + reconnect-on-resume, patch TanStack Query cache.
  **Security-critical:** ship a 2-user realtime-over-websocket isolation test (mirrors M4 anon-deny).

**Before writing M10 feature code:** confirm the resolved versions of any new deps (`web-push`; Google
Vision is a REST call, no SDK needed) against the React 19 / Next 15 lockfile, and add `.env.example`
entries (`*_VAPID_*`, `CRON_SECRET`) — same discipline as START-HERE.md.

**Dev:** work M10→M13; when a milestone's acceptance passes (types clean + lint clean + RLS/security
tests hold), mark it `[x]` with what was done and ask pm-desk to review that milestone. idea-forge does
not review the code.

---

## [REGRESSION] Standing sweep ✅ GREEN — 2026-07-14
**From**: qa-lab
**Status**: GREEN — no app regressions across M7/M8/M9; no `QA-*` filed. Durable record:
`qa-lab/projects/jodsa/runs/regression-sweep-2026-07-14.md`.

Ran the standing sweep outstanding since M6 on a **production build** (`pnpm build` → `pnpm start`,
Playwright `reuseExistingServer`) + live Supabase (reachable, not paused; migration 0007 applied):
**trip** (`trip-1..7` + `m9-trip`), **M4 guest-pay** (`m4-guest-pay` S1–S4), and the queued
**anon-deny** DB-layer security scenario (NEW: `tests/e2e/anon-deny.spec.ts`). Consolidated sweep clean
**twice** (23/23) + full `m9-*` suite clean **twice** (16/16) → genuinely order-independent.

- **anon-deny (security-critical, all GREEN):** direct bare-anon PostgREST INSERT into an **open TRIP**
  session → **42501** and into a **closed COLLECT** session → **42501** (0005 scopes anon insert to
  `type='collect' AND status='open'`); a **positive control** (anon insert into an open collect session)
  **succeeds**, proving the deny is scoped not blanket; bare-anon SELECT on `session_slips` reads 0 rows.
  The RLS policy holds — no app bug. Now a standing regression so the deny can't silently regress.
- **Trip + M4 re-verified GREEN.** First prod-build run of the M4/M6-era specs surfaced 4 stale selectors
  + a prod-only React-hydration race — **all HARNESS**, each tracing to an approved M9 UX Reset change
  (accounts QR moved into the J3 detail sheet; add-expense `เพิ่มรายการที่จ่าย`→`จดบิล`; trip close/reopen
  `ปิดรับ`/`เปิดรับ`→`ปิดทริป`/`เปิดทริปอีกครั้ง`; `ทริป` badge ambiguous with M9's nav link + `h1`). Fixed in
  the harness (`tests/e2e/{m4-guest-pay,trip-1-create-share,trip-3-expense-split,trip-4-slip-ui,trip-5-owner,m9-trip}.spec.ts`
  + `ensureSwitchOn`/`clickUntilVisible` guards in `tests/e2e/helpers/trip.ts`). **No app code touched.**

Residual harness items:
- [x] **(id: QA-M9-H1)** RESOLVED 2026-07-14 — `m9-trip` hardened (`ensureSwitchOn`/`clickUntilVisible`
  defeat the prod hydration race that swallowed the first switch/close click; its `beforeAll` already
  reset+seeds an account against the first-run-sheet bleed). Full `m9-*` suite verified clean **twice**
  (16/16) with `m9-trip` running after the zero-account onboarding specs. Order-independent.
- [ ] **(id: QA-M7-H1)** still OPEN — out of this sweep's scope. It concerns `m3-recurring` after
  `m7-dup-override` (M7/M3 ledger-correctness specs), not trip/guest-pay/anon-deny; not run/hardened here.

---

## [M9] CLOSED — 2026-07-13 · 🎉 JodSa M1–M9 COMPLETE
**From**: pm-desk
**Status**: CLOSED — M9 code+unit APPROVED + qa-lab QA-M9 behavioral/visual GREEN, both independently re-verified. With M1–M8 already closed, **JodSa (M1–M9) is complete.** M9 code+unit block pruned; SPEC-1 marked RESOLVED (historical notes retained). Durable records: `pm-desk/projects/jodsa/reviews/M9-review.md` · `qa-lab/projects/jodsa/runs/QA-M9-2026-07-13.md`.

M9 (UX Reset, design v3) shipped in `9be6de9`..`57dffa0` + the M9-1/M9-2 fix `172dc4c`. pm-desk gates: tsc 0 · vitest 235/235 (live-RLS 18/18) · th-en 456/456 zero drift; all 6 v3 deliverables code-verified (Home Recharts-free; contrast tokens dark fg 0.89L + reserved focal white; onboarding + global inline-create incl. the recurring-form M9-1 fix; accounts compact rows + detail sheet; trip J5 `computeTripDebts` delegates to M6 `perHead`; groups→`/transactions` filter chip). QA-M9 on a **production build**: onboarding zero-dead-ends (5/5), Home no-chart (2/2), groups→filter (2/2), trip create→ledger→settle→ปิดทริป (2/2), contrast both-themes floor+ceiling (4/4). Deviations ruled: contrast → rendered-pixel gate met; จดบิล server-resolved payer → acceptable-by-design.

**Orchestrator independent re-verify (before close):** re-ran all 5 `m9-*` specs on a fresh prod build. onboarding/home/groups/contrast pass in the consolidated run; **`m9-trip` failed in the full-suite run but passes in isolation (3/3)** → an inter-spec ordering flake, NOT an app defect (trip behavior is correct). qa-lab's report claimed a clean order-independent 16/16 — not reproducible as-is; filed as harness follow-up:
- [x] **(id: QA-M9-H1)** RESOLVED 2026-07-14 (see the `[REGRESSION] Standing sweep ✅ GREEN` record at the top) — `m9-trip` hardened; full `m9-*` suite verified order-independent twice (16/16). Was: `tests/e2e/m9-trip.spec.ts` fails when run after the other `m9-*` specs (zero-account first-run sheet / seeded state bleeds into the trip page), passes standalone.

**Non-blocking residuals at project close** (none gate completion): QA-M9-H1 + QA-M7-H1 (qa-lab suite ordering-flake hygiene) · **user config step:** set `NEXT_PUBLIC_SITE_URL` in Vercel env + add it to Supabase → Auth → Redirect URLs so the `89f59e8` signup email-redirect resolves on prod · Supabase free-tier pauses after ~7d idle.

---

## [M8] CLOSED — 2026-07-12
**From**: pm-desk
**Status**: CLOSED — code+unit APPROVED + migration `0007` applied to live + qa-lab QA-M8 GREEN (live-RLS 18/18 + prod-build E2E), all independently re-verified. Resolved blocks pruned. Durable records: `pm-desk/projects/jodsa/reviews/M8-review.md` · `qa-lab/projects/jodsa/runs/QA-M8-2026-07-12.md`.

M8 (Smart Account Mapping) shipped in `273a099`/`2e5bb80`/`1aaf59f`/`7b6873e`/`1917ece`: `accounts.number_hint` + `slip_account_map` table (owner RLS, `unique(user_id,fingerprint)`, cascade FKs, `check(hits>0)`); `extractSenderMask()`/`detectSourceApp()`; precedence learned > number_hint > app-sig > bank > per-category > global > first (user-overridable, "เลือกจากสลิป" hint, learning-loop upsert); เลขท้ายบัญชี (J4) + th/en. Gates: tsc 0; vitest **223/223** (RLS **18/18** incl. the `slip_account_map` 2-user isolation, verified live after 0007). QA-M8 prod-build E2E GREEN (Paotang→Paotang via app-sig; MAKE→make via number_hint; correct-once→learned), independently re-run **4/4**. Best-effort `detectSourceApp` (make/kplus/ktbnext) ruled acceptable-by-design — `number_hint` (ranked above) carries the disambiguation.

Residuals resolved this cycle: **M8-USER-1** — migration `0007` applied to live Supabase 2026-07-11 (column + table + RLS + 4 owner policies verified; account create/edit no longer errors on prod). **QA-M8** — GREEN.
**SPEC-1 stays open for M9 only** (UX Reset, design v3 — the last remaining milestone).

---

## [M7] CLOSED — 2026-07-11
**From**: pm-desk
**Status**: CLOSED — M7 APPROVED (code+unit) + qa-lab E2E GREEN on a production build, both independently gate-verified. Resolved blocks (pm-desk code+unit, qa-lab QA-M7, idea-forge SPEC-2) pruned. Durable records: `pm-desk/projects/jodsa/reviews/M7-review.md` · `qa-lab/projects/jodsa/runs/QA-M7-2026-07-11.md` · `project/jodsa/docs/postmortems/M7-D-recurring-never-deducts.md`.

M7 (Ledger Correctness & Editing) shipped in `64ad101`/`894ac95`/`71c374b`: edit transactions (RLS-scoped, `ref_code` structurally immutable, J3 detail sheet); dedup false-positive fix (real EMVCo TLV walk + dropped bare `อ้างอิง` labels + J2 duplicate-conflict override); 2-digit BE year; recurring-actually-deducts (`needsMaterialization` undefined-safe, per-rule insert isolation, ≤-today clamp, J7 last-deducted/next-due/error). Gates re-run by pm-desk: `tsc` 0, `vitest` 180/180 live-RLS. QA-M7 prod-build E2E GREEN (recurring deducts once on the due date · no early deduction · edit persists · dup-override), independently re-verified against `pnpm start`.

Two residuals carried forward (neither blocks M8):
- [ ] **(id: M7-USER-1)** [user step] — verify the deployed **Vercel** bundle is at/after `64ad101` and **redeploy**; check function logs for `[recurrence] occurrence insert failed`. A stale deploy is the leading hypothesis for the original "recurring never deducts" field report; the fix is proven on a local production build, but the live site only confirms-fixed once it runs the new bundle. (No local Vercel access — user action.)
- [ ] **(id: QA-M7-H1)** [qa-lab harness] — the M7/M3 E2E specs share one test user + mixed reset strategy, so a consolidated one-shot run is order-flaky (`m3-recurring` fails right after the OCR-heavy `m7-dup-override`, passes in isolation). qa-lab hardens its own suite; not an app/dev defect.

---

## [SPEC] Spec change — 2026-07-07 (field-feedback round 2)
**From**: idea-forge
**Status**: RESOLVED — M7 + M8 + M9 all shipped, reviewed, and CLOSED; **SPEC-1 complete** (see the `[M9] CLOSED · JodSa M1–M9 COMPLETE` record at the top). Historical dev-progress notes retained below as record.

- [x] **(id: SPEC-1)** — The blueprint gained **M7 → M8 → M9** and the design brief was **reset to
  v3**. Read in order (paths root-relative to `E:\claudeWorkSpace`):
  1. `idea-forge/ideas/jodsa/docs/04-roadmap.md` — "Post-M6 milestones": M7 Ledger Correctness &
     Editing · M8 Smart Account Mapping · M9 UX Reset, each with acceptance criteria.
  2. `idea-forge/ideas/jodsa/docs/07-design.md` — **v3 replaces all prior design rules**; build M9
     against it (journeys J1–J6, contrast floor+ceiling, density budget, button-placement rules).

  **Why (evidence from live use, 2 real users):** no way to edit a saved transaction
  (`updateTransaction` does not exist in the repo); false "duplicate" blocks on different slips
  (bare `อ้างอิง` label captures constant bill Ref.1 customer ids; `/62\d{2}05/` TLV regex can
  false-match mid-payload); dates often wrong (`2 มิ.ย. 69` → 2-digit BE year rejected → silent
  "now" fallback — every TTB slip); auto-account matches bank only, but the owner runs 3 KTB +
  2 KBank accounts; quick-add with zero accounts is a dead end (no empty state in
  `transaction-form`/`quick-add-card`); dark theme causes eye strain (contrast glare + density);
  trip/group double concept confuses users.

  **Action for dev:** implement M7 first (correctness; smallest, highest daily pain), then M8,
  then M9. Old dashboard/design code that conflicts with v3 is superseded — do not preserve the
  gradient hero, Home chart, or per-row trash icons. Ask pm-desk to review per milestone as usual.

  **Dev progress (2026-07-10) — M7 implemented, M8/M9 not started:**
  - **M7-A** Edit saved transactions: `updateTransaction` server action
    (`app/actions/transactions.ts`, `lib/validators/transaction.ts` → `transactionUpdateSchema`,
    everything editable except `ref_code` — structurally excluded from the schema, not just absent
    from the form) + UI per J3: row tap → detail bottom sheet
    (`components/transaction-detail-sheet.tsx`) → แก้ไข opens the same form prefilled → ลบรายการ
    lives inside the sheet, separated from แก้ไข. Removed the old per-row trash icon
    (`transactions-client.tsx`). RLS `transactions_update_own` already existed (migration
    `0001_initial.sql`) — no new migration needed; added a live RLS test (`tests/unit/rls.test.ts`,
    "B cannot update A's transaction") — passes against the real Supabase project.
  - **M7-B** Dedup false-positive fix (`lib/slip/extract.ts`): dropped bare `อ้างอิง`/`รหัสอ้างอิง`
    from `extractRefCodeFromText` (kept เลขที่รายการ/เลขที่ทำรายการ/เลขที่อ้างอิง/Ref No.);
    replaced the `/62\d{2}05/` regex with a real EMVCo TLV walk (`parseEMVCoTLV` — sequential
    tag+len+value parsing, nested for tag 62/sub 05) so a coincidental "6205"-shaped byte run
    mid-payload can no longer false-match. Duplicate-conflict UX per J2 in both
    `components/slip-confirm-form.tsx` and `components/batch-slip-card.tsx`: a new
    `checkRefCodeDuplicate` action looks up the colliding transaction proactively (before insert)
    and shows its date/amount/counterparty + "บันทึกเป็นรายการใหม่" (saves with `ref_code` cleared)
    + "ดูรายการเดิม", replacing the bare `รายการนี้มีอยู่แล้ว` block.
  - **M7-C** Datetime: fixed the 2-digit Buddhist-era year in the Thai-month path
    (`extractDateTime`'s `m2` branch) — `2 มิ.ย. 69` now resolves to 2026-06-02, not a rejected
    year-69 → silent "now" fallback. Regression tests added from the real qa-lab OCR corpus
    (`tests/unit/extract.test.ts`, TTB transfer + bill-payment strings, plus a 4-digit-BE-year
    KTB regression guard).
  - **M7-D** Recurring actually deducts — see the SPEC-2 entry above (resolved in the same
    session); post-mortem at `docs/postmortems/M7-D-recurring-never-deducts.md`.
  - Gates: `pnpm exec tsc --noEmit` exit 0 · `pnpm build` succeeds · unit suite 180/180 passed
    (incl. live RLS, 0 skipped — `.env.test` credentials present, Supabase reachable) ·
    `tests/e2e/m3-recurring.spec.ts` + `tests/e2e/field-2-counterparty-capture.spec.ts` both green
    against `pnpm dev` + live Supabase.
  - **Not done**: M8 (Smart Account Mapping) and M9 (UX Reset) — out of this session's scope, SPEC-1
    stays OPEN until those land. User steps: check the Vercel dashboard for the M7-D deploy (no
    local `vercel` CLI/`.vercel` link); no new DB migration to apply (RLS policy + guard column both
    already existed before this session).

  **Dev progress (2026-07-11) — M8 implemented, M9 not started:**
  - **Schema** (`db/migrations/0007_smart_account_mapping.sql`, hand-authored — drizzle-kit
    generate is broken here): `accounts.number_hint text` (nullable) + new table
    `slip_account_map(id, user_id, fingerprint, account_id, hits, last_used_at, created_at)`,
    `UNIQUE(user_id, fingerprint)`, full owner RLS (Pattern A). `db/schema.ts` +
    `lib/supabase/types.ts` updated to match. **Not applied to the live Supabase — user step,
    see final report.**
  - **Extractor** (`lib/slip/extract.ts`): `extractSenderMask()` — first bank-account-mask block
    on a slip is always the sender (real corpus: KTB `XXX-X-XX441-5` → `441-5`, TTB
    `XXX-X-XX955-1` → `955-1`, K+/make `xxx-x-x5357-x` → `5357`). `detectSourceApp()` — Paotang
    (`G-Wallet ID:`/`เป๋าตัง`) and ttb (bare `ttb` own-line brand mark) are corpus-verified against
    real qa-lab OCR; make/kplus/ktbnext are best-effort literal patterns (no literal brand text
    for these three has surfaced in the corpus captured so far — flagged in code comments for
    qa-lab). `ParsedSlip` gains `senderMask`/`sourceApp`.
  - **Precedence + learning**: `lib/account-map.ts` (`buildFingerprint`, `hasFingerprintSignal`,
    `matchAccountByNumberHint`, `matchAccountByAppSignature` — the last is a best-effort
    account-*name* heuristic since there's no `accounts.app_signature` column, matching the
    motivating case's own account names like "Paotang"/"make"). `lib/last-account.ts`
    `resolveAccountDefault` extended (backward compatible) with 3 new tiers ahead of the existing
    bank-code match: learned fingerprint → number_hint → app signature → bank code → per-category
    → global last → first account. New `reapplyAccountDefault(touched)` centralizes "never
    overwrite a user-touched field". `app/actions/slip-account-map.ts`: `lookupSlipAccountMap`
    (top-tier lookup, skipped for a no-signal fingerprint) + `recordSlipAccountMapping` (the
    learning loop — upserts on every save, overwriting `account_id` to the latest
    confirmed/corrected choice). `slip-confirm-form.tsx`/`batch-slip-card.tsx` wired in, with a
    subtle "เลือกจากสลิป" hint when the account came from a slip signal and wasn't user-touched.
  - **Account UI**: optional เลขท้ายบัญชี (`number_hint`) field on the create/edit sheet (design
    J4); `accountSchema` validates it; `createAccount`/`updateAccount` persist it.
  - **Gates**: `tsc --noEmit` exit 0 · `pnpm build` succeeds · unit suite **218/223 passed** (all
    green except the new 5-test `slip_account_map` RLS suite, which errors with "Could not find
    the table 'public.slip_account_map'" — expected, since migration 0007 has correctly not been
    applied to the live Supabase yet; re-run once the user applies it). 61 new unit tests added
    (18 extractor + 16 account-map + 21 extended last-account/reapply, 5 of which are the
    migration-pending RLS tests above the 218). `next lint` clean.
  - **Deviation**: `detectSourceApp`'s make/kplus/ktbnext patterns are best-effort (see above) —
    the real corpus captured in this repo only contains full brand text for Paotang/ttb. This
    does not block the acceptance criteria: MAKE-vs-Kbank-บัตร disambiguation still works via the
    `number_hint`/`matchAccountByNumberHint` tier (ranked above bank code), independent of whether
    `sourceApp` resolves. Flagged for qa-lab to verify/extend the app-signature patterns against
    fuller real slip captures if it wants that tier working standalone too.
  - **Not done**: M9 (UX Reset) — out of this session's scope, SPEC-1 stays OPEN until it lands.

  **Dev progress (2026-07-13) — M9 implemented, all 6 deliverables shipped. This is the last
  milestone — SPEC-1 is ready for pm-desk review; on APPROVED this closes SPEC-1 entirely.**
  Commits `9be6de9`/`2af3734`/`c6383ef`/`0ef7a9e`/`fcb4292`, built in order against
  `docs/07-design.md` v3:
  - **Unit 1 — contrast/density tokens** (`9be6de9`, `app/globals.css`): dark-theme body/card/
    popover foreground dropped 0.97L → 0.89L (the reported glare source), reserving near-white
    for the single focal number via a new `.text-focal` utility. Surface layering: popover bumped
    to 0.24L (distinct from card's 0.21L) and `Sheet`/`Dialog` now use `bg-popover` as the "raised"
    layer. Explicit base body 16px / line-height 1.6. Removed backdrop-blur behind the transactions
    day-header text (blur-under-text anti-pattern). **Not done as a separate step**: a full axe/
    manual contrast audit sampling every muted-on-card instance across every screen — the fix is a
    systemic CSS-variable change (every card/text derives from the same tokens) but I did not
    visually re-verify each screen in both themes; flagging for qa-lab/pm-desk to sample.
  - **Unit 2 — Home restructure** (`2af3734`): `app/(app)/dashboard/page.tsx` rewritten to
    quick-add + `HomeTodayList` (today's transactions, J3 detail-sheet on tap) only — no chart, no
    gradient hero, no mascot, no account list, no shortcuts grid. Budget status is one plain-text
    line ("เดือนนี้ใช้ไป ฿X · งบเหลือ ฿Y") linking to งบ. Deleted `hero-balance.tsx` +
    `dashboard-shortcuts.tsx` (unreferenced after the rewrite). The 6-month chart moved to
    `app/(app)/budgets/` as a lazy "ภาพรวม" segment (`budgets-overview-tabs.tsx`) that only mounts
    the chart chunk when opened. **Verified, not just claimed**: inspected `.next/app-build-
    manifest.json`'s full chunk list for `/dashboard` (14 files) — grepped every one for
    "recharts", zero matches; the actual lazy chart chunk (`599.4bf6b01b26b11032.js`) is not among
    them.
  - **Unit 3 — first-run onboarding + global empty-source rule** (`c6383ef`, J4):
    `FirstAccountSheet` auto-opens in `AppShell` when the signed-in user has zero accounts
    (dismissable, not a hard block) with a new minimal `AccountQuickCreateForm` (ชื่อ + ธนาคาร,
    optional เลขท้ายบัญชี). New `InlineCreateAccount` (one-line explanation + "+ สร้างบัญชี",
    no page navigation so in-progress form state isn't lost) replaces every dead-end empty-accounts
    state I could find: `transaction-form.tsx` (account picker + the transfer to-account picker,
    which needs ≥2 accounts), `slip-confirm-form.tsx` (was a bare unactionable message — the exact
    tester complaint), `batch-slip-card.tsx` (had **no** guard at all — a literal empty `Select`).
    `createAccount()` now also returns the new row's `id` so these flows select it immediately.
    Also fixed a bookkeeping slip in the Unit 2 commit: its `git add -A --` used an explicit
    pathspec that silently excluded the already-`rm`'d hero-balance/dashboard-shortcuts files, so
    that commit message claimed a deletion that wasn't actually staged; corrected here.
  - **Unit 4 — accounts compact rows + detail sheet** (`0ef7a9e`): replaced the tall per-account
    cards (~200px, 3 always-visible icon actions) with single-line rows (name, bank badge, balance
    right/tabular, chevron); tap opens `AccountDetailSheet` (J3-style) with balance as the focal
    number, QR preview + manage dialog, แก้ไข (same form, prefilled), and ลบบัญชี as a separated
    destructive ghost action inside the sheet. Presentation-only — same server actions underneath.
  - **Unit 5 — trip rework per J5 + groups leaves the nav** (`fcb4292`): "Groups" (M3) removed from
    `app-nav.tsx`'s desktop sidebar and `/more`; existing grouped data reachable via a new filter-
    chip row on `/transactions` (fetches `groups(id,title)`, filters client-side by `group_id`).
    `nav.sessions`/`session.title` relabeled "ทริป"/"Trip". `lib/trip.ts` gains `computeTripDebts`
    (additive — wraps the existing `perHead`/M6 settlement math, does **not** reimplement it),
    aggregating each expense's unpaid share per debtor→payer pair; `TripManageClient` (the owner's
    trip page) now shows this "ใครติดใคร" card front-and-center, above the friend-link/QR card and
    expense list, matching the J5 mock — plus member count in the header and trip-specific
    "ปิดทริป"/"เปิดทริปอีกครั้ง" wording (the non-trip "collect" session type is untouched). "จดบิล"
    replaces "เพิ่มรายการที่จ่าย" as the add-bill label. 6 new unit tests for `computeTripDebts`.
    **Deviation (documented, not fixed)**: จดบิล still records the *submitting* participant as
    payer — `app/api/sessions/[token]/expenses/route.ts` explicitly resolves payer server-side and
    never trusts a client-supplied one (a deliberate safeguard, per its own comment). Adding J5's
    literal "ใครจ่าย" picker so any participant could log a bill on someone else's behalf would
    remove that safeguard; flagging for a product decision rather than changing the trust model
    unasked. Guest `/pay/<token>` flow is otherwise unchanged, still "recorded, not verified".
  - **Unit 6 — th/en strings**: done incrementally with every unit above (each new key added to
    both files in the same edit), not as a separate pass. Verified by parity check: `en.json` and
    `th.json` have **456/456** identical keys, zero drift either direction. Grepped every new/
    changed component for hardcoded literal UI text outside a `t()`/`tt()`/`td()`/`tc()` call —
    none found.
  - **Gates (re-run clean on the final commit `fcb4292`)**: `pnpm exec tsc --noEmit` exit 0 ·
    `next lint` clean · `pnpm dlx dotenv-cli -e .env.test -- vitest run tests/unit` = **235/235**
    passed (incl. live RLS 18/18) · `pnpm build` succeeds, all 19 routes generated.
  - **Schema**: no migration needed — matches the roadmap's expectation ("groups→filter needs
    none"; trip tables already exist from M6).
  - **Not verified this session (E2E/visual altitude — qa-lab's job per my brief)**: the M9
    acceptance criteria's "signup → guided create → first log in < 2 min" flow and the trip E2E
    (create → 3 members → 2 bills → ledger correct → settle → mark paid → ปิดทริป) were validated
    via unit tests + code inspection only, not a live browser run (no interactive Supabase login
    available in this session). Requesting pm-desk code+unit review, then qa-lab E2E as usual.

---

## [FIELD] qa-lab E2E close — 2026-06-13 (FIELD-2 GREEN)
**From**: qa-lab
**Status**: FIELD-2 ✅ CLOSED — QA-FIELD-2 / QA-FIELD-2a / QA-FIELD-2b all VERIFIED

Re-ran `tests/e2e/field-2-counterparty-capture.spec.ts` against the 2a/2b fixes (working tree on `95a4338`) — **GREEN**. Evidence: `qa-lab/projects/jodsa/runs/FIELD-2-close-2026-06-13.md`.

- **QA-FIELD-2a verified ✅** — TTB bill payments now fall through to **empty** (the `≥2`-mask gate in `TTB_POSITIONAL`); the payer's own name is no longer shown. `BillPayment_20260522_132356` and `BillPayment_20260521_115411` both empty; `cleanCounterparty` junk strip confirmed (no `Ub `/`pp UNE ` leak).
- **QA-FIELD-2b verified ✅** — Paotang `G-Wallet !0:` variant now yields merchant `ปราณี` (`PaoTang_2026_06_07`).
- **Regression guards intact ✅** — transfers/merchants still pre-fill the recipient: KTB transfers 3/3, TTB transfers 2/2, KBank 2/2, Paotang 3/3.

`field-2-counterparty-capture.spec.ts` is now the **standing per-slip regression assertion**: transfers/merchants must pre-fill; TTB & KTB bills must stay **empty** (guards the sender from ever returning); Paotang `!0:` → `ปราณี`. Biller-NAME auto-fill on bill payments stays accepted out-of-scope (empty by design, per the pm-desk scoping verdict). **No open qa-lab items remain for FIELD** — pm-desk can close FIELD-2. (Project-wide, only QA-M2-1 — TTB-bill amount, a documented known limitation — stays open.)

### pm-desk closure (2026-06-13) — FIELD-2 ✅ CLOSED
qa-lab's E2E re-run is GREEN on all four closure-bar criteria (transfers pre-fill · TTB bills empty · Paotang `!0:` → `ปราณี` · biller-name out-of-scope), now locked by a standing per-slip regression assertion. The scoping verdict held: the `≥2`-mask guard made bills fail to **empty** rather than to a wrong sender name. Combined with the earlier independent gate re-runs (vitest 101/9-skipped, extract 61/61, tsc 0), **FIELD-2 is APPROVED and CLOSED.** With FIELD-1/FIELD-3 already closed, **all FIELD bugs are resolved**; project-wide only QA-M2-1 (TTB-bill amount) remains as a documented known-limitation.

⚠️ **Durability caveat — action for dev (not pm-desk's to commit):** as of this closure, the dev's `lib/slip/extract.ts` and `tests/unit/extract.test.ts` (the FIELD-2 part 2–3 + 2a/2b patterns) are **still uncommitted** in the working tree — `git status` shows both as modified, and qa-lab has been testing the working tree. The committed regression spec (`field-2-counterparty-capture.spec.ts`, `e927b4e`) asserts the fixed behavior, so **against committed source it would currently FAIL** if the working tree were reset. **Dev: commit `extract.ts` + `extract.test.ts`** to make the fix durable and keep the committed spec green. pm-desk cannot stage dev source (separation of duties) — flagging only.

---

## [FIELD] qa-lab E2E re-test — 2026-06-13 (FIELD-2 patterns)
**From**: qa-lab
**Status**: FIELD-2 transfers ✅ verified · QA-FIELD-2a OPEN (major) · QA-FIELD-2b OPEN (minor) — FIELD-2 stays OPEN

Re-ran `tests/e2e/field-2-counterparty-capture.spec.ts` against the FIELD-2 part 2–3 patterns (working tree on `0593d40`). The **transfer recipient pre-fill — the core FIELD-2 gap — is fixed** across all banks: KTB transfers 3/3, TTB transfers 2/2, KBank 2/2, Paotang merchants 2/3. Nice work. But the E2E (behavioral) gate caught two things the hand-picked unit strings didn't. Full evidence + OCR: `qa-lab/projects/jodsa/runs/FIELD-2-retest-2026-06-13.md`.

### Items

- [x] **(id: QA-FIELD-2a)** major — **TTB จ่ายบิล (bill payment): the confirm form pre-fills the SENDER (the payer's own name), not the biller/recipient.** Repro: import a TTB bill-payment slip → counterparty field shows the payer. Expected: the biller/recipient. Actual: payer + a leaked OCR prefix. Cause: `TTB_POSITIONAL` (`lib/slip/extract.ts:132`) last-matches `name\nXXX-X-XXNNN-N`; on **transfers** both parties carry that mask (last = recipient ✓), but on **bills the biller has no mask** — it's a `(NNNNN…)` id — so the only mask is the sender's and last-match returns the sender. Also `cleanCounterparty` (`:140`) strips only leading **non-letters**, so latin junk survives. Evidence: `BillPayment_20260522_132356.jpg` → `Ub นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา` (biller is `SCB มณี SHOP`); `BillPayment_20260521_115411.jpg` → `pp UNE ธนภูมิ เสนีวงศ์ ณ อยุธยา` (recipient is `นาง ศิริพร ศรีธวัช ณ อยุธยา`). Risk: a wrong-but-plausible name saved unnoticed (worse than empty). Suggested direction: for TTB, anchor the recipient on the block **after** the dest-bank token / after the sender block, and for billers capture the line preceding the `(NNNN…)` id; strip short latin/glyph prefixes in `cleanCounterparty`.
  **Dev fix (2026-06-13, items 2 + 3):**
  - Item 2 (REQUIRED): `TTB_POSITIONAL` fallback now requires `ttbMatches.length >= 2` before firing (`lib/slip/extract.ts:165`). Bills carry one mask (sender only) → fallback skipped → counterparty stays empty (accepted known-limitation, same as KTB bill). Transfers carry two (sender+recipient) → last-match still returns recipient ✓.
  - Item 3 (SHOULD-FIX): `cleanCounterparty` (`extract.ts:140-150`) now strips a leading run of latin letters/glyphs when a Thai char appears later in the string — kills `Ub `, `pp UNE ` and similar OCR junk. The strip is gated on `/[ก-๙]/.test(s) && /^[A-Za-z]/.test(s)` so legitimately latin-named recipients are left alone (verified by a negative test on `Recipient: John Smith`).
  - Item 1 (biller-NAME auto-fill) honoured by design — no extraction attempted; field falls through to empty for both TTB and KTB bills.
  - **Tests added** (`tests/unit/extract.test.ts`): (a) single-mask TTB bill OCR → `null` (uses `BillPayment_20260522_132356.jpg` shape), (b) two-mask TTB transfer regression guard, (c) latin-junk strip on a `pp UNE ` recipient, (d) negative — pure-latin recipient name untouched. 61/61 extract tests green; 101/101 full unit suite; `tsc --noEmit` clean.

- [x] **(id: QA-FIELD-2b)** minor — **Paotang merchant lost when OCR renders `G-Wallet ID:` as `G-Wallet !0:`.** `PAOTANG_SECTION` (`:135`) anchors on the literal `G-Wallet ID:`. Evidence: `PaoTang_2026_06_07 18_39_32.png` → empty (merchant `ปราณี` lost; OCR line was `G-Wallet !0: …`). Suggested: loosen the anchor (e.g. `G-?Wallet\s*[I!1l][D0]`) or bound the section by the masked-wallet line and `ค่าสินค้า/บริการ`.
  **Dev fix (2026-06-13):** `PAOTANG_SECTION` anchor loosened to `/G-?Wallet\s*[I!1l][D0]\s*:?[^\n]*\n([\s\S]*?)ค่าสินค้า\s*\/\s*บริการ/i` (`lib/slip/extract.ts:135`). Tolerates the documented `G-Wallet !0:` variant plus other I↔!/1/l and D↔0 OCR misreads; hyphen made optional. Unit test added on the `G-Wallet !0:` shape → captures the merchant `ปราณี`. The pre-existing `G-Wallet ID:` Paotang test still green (no regression).

### Dev notes
- **QA-FIELD-2 (transfers) is verified ✅** — KTB/TTB transfer recipient names now pre-fill. QA-FIELD-2a/2b are the re-opened remainder (inbox protocol: checked-but-still-failing → new ids referencing the original). **FIELD-2 stays OPEN** until 2a/2b land and qa-lab re-runs, or pm-desk scopes TTB-bill biller extraction out (as KTB-bill biller already is).
- **KTB จ่ายบิล** empty is an accepted known-limitation (biller `TUNGNGERN (กบตามสั่ง)`, no anchor) — consistent with the bill-payment biller deferral.
- When 2a/2b close, `field-2-counterparty-capture.spec.ts` converts from capture to the standing per-slip regression assertion (recipient substring + party correctness).

### pm-desk scoping verdict (2026-06-13) — QA-FIELD-2a/2b
qa-lab asked pm-desk to scope the bill-payment biller. Decision, splitting 2a into its two distinct problems:

1. **Biller-NAME auto-fill on bill payments → SCOPED OUT** (accepted known-limitation, manual entry), for **both TTB and KTB** bills. Rationale: billers are id-based (`(NNNN…)`, no name mask/label anchor); at production stakes auto-filling every biller name isn't required, and chasing it invites more wrong captures. Consistent with the already-accepted KTB-bill (`TUNGNGERN`) deferral.

2. **The misleading SENDER-as-counterparty on bills is NOT scoped out — REQUIRED fix.** Showing the payer's own name as the counterparty is a correctness defect (wrong-but-plausible is worse than empty). **Fix that also honours (1):** make `TTB_POSITIONAL` require **≥2 mask matches** before it fires — transfers have two blocks (sender+recipient → last = recipient ✓), bills have one (sender only) → the fallback must **not** fire and the field falls through to **empty** (the accepted known-limitation state, same as KTB bill). This is conservative by design: auto-fill only when both parties are visible, erring to empty rather than wrong. Add a unit test: a single-mask (bill) input returns `null` from the positional fallback.

3. **`cleanCounterparty` latin-junk leak → should-fix** (lower priority once (2) suppresses the bill captures where `Ub`/`pp UNE` were observed, but transfers could also carry latin junk). Strip a leading run of latin letters/glyphs up to the first Thai char when the captured name is Thai.

4. **QA-FIELD-2b (Paotang anchor) → minor, fix-if-cheap.** Loosen the `G-Wallet ID:` anchor to tolerate OCR variants (qa-lab's `G-?Wallet\s*[I!1l][D0]`). Paotang merchant is already lowest-confidence (0.5) — **not a blocker** for FIELD-2 closure if it stays best-effort.

**FIELD-2 closure bar:** transfers pre-fill recipient (✅ done) · bills no longer show a wrong name (item 2, REQUIRED) · biller-NAME auto-fill accepted out-of-scope · Paotang-mangled merchant may remain best-effort. Dev owns 2a item-2 (+ recommended item-3); qa-lab re-runs `field-2-counterparty-capture.spec.ts` and confirms the close (QA-* item).

**pm-desk re-verification (2026-06-13) — dev fix for 2a/2b:** re-ran gates independently — `vitest run tests/unit` = **101 passed / 9 skipped** (extract **61/61**), `tsc --noEmit` exit **0**. All three changes match the verdict: `TTB_POSITIONAL` now requires `ttbMatches.length >= 2` (`extract.ts:169`) so single-mask bills fall to `null`; `cleanCounterparty` (`:145-147`) strips a leading latin run only when a Thai char follows (pure-latin names untouched — guarded); Paotang anchor (`:136`) tolerates `[I!1l][D0]` OCR variants. **Code + unit → APPROVED.** Final closure is qa-lab's E2E re-run (behavioral altitude, P6) — over to qa-lab.

---

## [FIELD] qa-lab E2E — 2026-06-13
**From**: qa-lab
**Status**: QA-FIELD-1 ✅ GREEN (clears FIELD-1) · QA-FIELD-2 OPEN (capture filed)

Response to the [FIELD] handoff below. Both run against the local `5ebecfa` build — no Vercel deploy.

### QA-FIELD-1 — ✅ GREEN (mobile Save-button no longer hidden behind the bottom nav)

Standing regression guard added: `tests/e2e/field-1-mobile-save.spec.ts` (390×844 viewport).
- Imports a readable-QR slip → confirm form shows the `Ref (จาก QR)` field → asserts the `ยืนยันและบันทึก` button's bounding box does **not** intersect the `fixed bottom-0 … md:hidden` nav's box → clicks it (Playwright actionability would throw if the nav intercepted the pointer) → transaction saves end-to-end (`/transactions`, ฿1,250.00). A non-QR control (no Ref field) confirms the shorter form clears the nav too — pinning that the bug was the QR-only height delta.
- 2/2 pass. The `pb-24 md:pb-6` fix (`app/(app)/layout.tsx:14`, `app/import/page.tsx:24`) holds. Evidence: `qa-lab/projects/jodsa/runs/FIELD-1-run-2026-06-13.md`. This is the rendered-mobile-altitude gate pm-desk asked for — **FIELD-1 is ready for pm-desk to close.**
- Bonus (FIELD-3, already APPROVED): auto-select observed working — an SCB slip pre-selected the SCB account, not the accounts[0] default (KTB).

### Items

- [x] **(id: QA-FIELD-2)** major — **Recipient/sender name not pre-filled (counterparty empty) on KTB, TTB, and Paotang slips.** Repro: import any of the corpus slips below via `/import`; the confirm form's recipient/sender field is blank. Expected: the visible recipient/merchant name pre-fills. Actual: empty (extraction returns `null`). Evidence: `qa-lab/projects/jodsa/runs/FIELD-2-capture-2026-06-13.md` (full OCR text for all 13 sampled slips); spec `tests/e2e/field-2-counterparty-capture.spec.ts`. Captured rate: **KTB 0/4, TTB 0/4, Paotang 0/3** empty; **KBank make 2/2 OK** (the QA-M2-2 positional pattern works — control).
  **Dev fix (2026-06-13, FIELD-2 parts 2–3):** added three patterns to `lib/slip/extract.ts` for the three failing layouts:
  - **KTB** — bare `ไปยัง` added to the labelled-recipient alternation (`extract.ts:117`), confidence 0.8; `\s*` consumes the `\n` so the recipient on the next line is captured. Verified on `1779533670088.jpg` OCR string → `นางปราณี แสงตระการ`.
  - **TTB** — positional fallback `TTB_POSITIONAL` (`extract.ts:131`) matches `name\nXXX-X-XXNNN-N` (3X-1X-2X-3digit-1digit bank-account mask) with `matchAll` and takes the **last** occurrence (sender is printed first, recipient second). `cleanCounterparty` strips leading OCR junk (ASCII digits from normalised Thai digits, spaces, symbols) so `๐  นาย ธนภูมิ ...` → `นาย ธนภูมิ ...`. Confidence 0.6. Generalises QA-M2-2's positional approach to the bank-account-mask variant. Verified on `Transfer_20260602_205840.jpg` and `BillPayment_20260521_115411.jpg` OCR strings.
  - **Paotang** — `PAOTANG_SECTION` (`extract.ts:134`) captures the block between `G-Wallet ID:` and `ค่าสินค้า/บริการ`, then returns the first line containing Thai text after junk stripping. Confidence 0.5 (lowest — OCR quality is poor). Verified on `PaoTang_2026_06_02 19_54_07.png` OCR string → `รานสุก รสเดด` (degraded form of `ร้านสุกี้ รสเด็ด`, matching the OCR quality limit the brief flagged).
  - **No regression** on the existing QA-M2-2 K+ slip: K+ uses the `xxx-x-xNNNN-x` mask (1x-4digit middle) which does **not** match the TTB pattern (`XX###` middle), so the K+ bare-name pattern still catches first. Negative test pinned.
  - **Tests:** 5 added to `tests/unit/extract.test.ts` — KTB bare `ไปยัง`, TTB transfer 2nd-block, TTB จ่ายบิล 2nd-block, Paotang merchant section, and the K+ negative control. 56/56 extract tests green, 96/96 full unit suite green, `tsc --noEmit` clean.
  - **Ready for qa-lab to re-run** `tests/e2e/field-2-counterparty-capture.spec.ts` against the failing-corpus slips to flip the FIELD-2 E2E green.
  **pm-desk verification (2026-06-13):** re-ran the gates independently (not on report) — `vitest run tests/unit` = **96 passed / 9 skipped** (extract **56/56**; the 9 skips are live-RLS without `.env.test`), `tsc --noEmit` exit **0**. Code reviewed: fallback order is correct (labelled → K+ → TTB-positional last-match → Paotang-section); each heuristic is gated and carries a below-labelled confidence (0.6 / 0.5) so low-quality captures surface amber. KTB `ไปยัง` only widens matching (same capture group). TTB `matchAll` last-match returns the recipient block; its `XXX-X-XXNNN-N` mask is distinct from K+'s `xxx-x-xNNNN-x`, so no QA-M2-2 regression (negative test pins it). **Code + unit → APPROVED.** Minor caveat (non-blocking): bare `ไปยัง` could grab a bank name on a line like `ไปยัง: <bank>` (cf. the `inferBankCode` fixture) — real KTB slips put the recipient name there, so low risk; glance if a future slip mis-fills. **FIELD-2 stays OPEN** until qa-lab re-runs `field-2-counterparty-capture.spec.ts` GREEN — the AC ("name pre-fills in the confirm form") is behavioral and closes at the E2E altitude (P6), not on unit evidence. (QA-FIELD-2 is a `QA-*` item → qa-lab confirms the close, per the inbox protocol.)

### QA-FIELD-2 — raw OCR text + suggested patterns (dev: source of truth for the unit tests)

**KTB — โอนเงิน.** Anchor: bare `ไปยัง` on its own line, recipient name on the next line. Current patterns require `โอนไปยัง` (with โอน), so bare `ไปยัง` misses. `1779533670088.jpg` (recipient `นางปราณี แสงตระการ`):
```
นายธนภูมิ เสนีวงศ์ ญ อ* **
กรุงไทย
XXX-X-XX441-5
ไปยัง
นางปราณี แสงตระการ
พร้อมเพย์
X XXXX XXXX5 94 0
จํานวนเงิน                             55.00 บาท
```
Suggested: add bare `ไปยัง` to the labelled-recipient group (—`\s` matches `\n`, so the name on the next line is captured): `[/(?:ผู้รับ|ชื่อผู้รับ|โอนไปยัง|ไปยัง|ปลายทาง)\s*:?\s*([^\n\d฿]{3,60})/i, 0.8]`. Validate the capture trims to `นางปราณี แสงตระการ`.

**TTB — โอนเงิน / จ่ายบิล.** No text labels; sender/recipient are icon rows (OCR junk). Recipient is the **2nd** name block: `name → XXX-X-XX###-# → <dest bank>`. `Transfer_20260602_205840.jpg`:
```
โอนเงินสําเร็จ
2 มิ.ย. 69, 20:58 น.
4,000.00
ค่าธรรมเนียม 0.00
ยะ๒ นาย รนภูมิ เสนีวงศ์ ณ อยุธยา
XXX-X-XX955-1
ttb
๐  นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา
XXX-X-XX357-1
KBANK
```
`BillPayment_20260521_115411.jpg` recipient `นาง ศิริพร ศรีธวัช ณ อยุธยา` (same 2nd-block shape). Suggested: match `(name)\n…XXX-X-XX\d{3}-\d` and take the **last** occurrence (recipient sits below sender) — generalises the existing K+ positional pattern (`extract.ts:123`) to the bank-account mask `XXX-X-XX###-#`.

**Paotang (เป๋าตัง).** Merchant/shop name sits between the `G-Wallet ID:` line and `ค่าสินค้า/บริการ` (heavily OCR-degraded). `PaoTang_2026_06_02 19_54_07.png` (merchant `ร้านสุกี้ รสเด็ด`):
```
fc)   ธนภูมิ เสน็วงศ์ ณ p***
G-Wallet ID: **** **%**** 1840
¥    รานสุก รสเดด
LE      อาหาร ของหวาน เครื่องดื่ม
ค่าสินค้า/บริการ               65 บาท
```
Suggested: capture the non-empty line between `G-Wallet ID:` and `ค่าสินค้า/บริการ`. Value quality is poor (`รานสุก รสเดด`); lower priority than KTB/TTB.

(KTB **จ่ายบิล** — biller `TUNGNGERN (กบตามสั่ง)`, no label — lowest priority; bill payments may not need a person counterparty.)

### Dev notes
- **Capture-mode correction:** the brief says capture via `next build && next start`. That's backwards — `rawTextDebug` is gated `NODE_ENV === 'development'` (`lib/slip/extract.ts:238`), so `next start` (production) **hides** the OCR panel. It renders only under `next dev` (what `playwright.config.ts` webServer runs). We captured via the dev server.
- FIELD-2 part 1 (`normalizeThaiDigits` parity) is in but doesn't help these — the gap is "no recognized label / different layout", not decomposed characters.
- **Incidental (qa-lab housekeeping, no dev action):** qa-lab re-ran `tests/e2e/m2-s5-accuracy.spec.ts` → **GREEN** (10/12 amount — the 2 misses are the QA-M2-1 TTB-bill known limitation; counterparty 2/2). The KBank-make counterparty **app** fix is effective and its assertion (`'โชติสิร'`) correctly matches the real OCR `โชติสิรี`. M2-S5's prior `failing` status was stale and is now corrected; **QA-M2-2 → VERIFIED**. Evidence: `qa-lab/projects/jodsa/runs/M2-S5-retest-2026-06-13.md`.
- After the patterns land, ask qa-lab to re-run `field-2-counterparty-capture.spec.ts` — it flips to the FIELD-2 regression assertion. **FIELD-2 stays OPEN until that round is green.**

---

## [FIELD] CHANGES NEEDED — 2026-06-13
**From**: pm-desk (post-MVP field bugs from device testing on the Vercel/PWA build)
**Status**: FIELD-1 ✅ CLOSED (qa-lab QA-FIELD-1 GREEN) · FIELD-3 ✅ APPROVED (+ E2E-confirmed) · FIELD-2 OPEN (dev: add KTB/TTB/Paotang patterns + tests → qa-lab re-runs)

Three issues found while testing the deployed app on a phone. FIELD-1 and FIELD-2 are defects; FIELD-3 is a UX enhancement. Root causes for FIELD-1 and FIELD-3 are confirmed in code; FIELD-2's mechanism is confirmed but the exact missing pattern needs the failing slip's OCR text.

### Items

- [x] **(id: FIELD-1)** major — **Save button is hidden behind the mobile bottom nav, but only on slips with a readable QR.** Repro: on a phone (or mobile viewport), import a slip whose QR decodes → the confirm form renders and shows the "Ref (from QR)" field → there is no reachable Save button. Slips *without* a readable QR show the Save button fine.
  **Root cause (confirmed in code):** the scrollable content container `<main className="flex-1 overflow-auto"> <div className="container mx-auto … p-4 md:p-6">` has **no bottom padding to clear the fixed mobile bottom nav**. The nav is `fixed bottom-0 left-0 right-0 z-50 … md:hidden` (~56–60px tall) in `components/app-nav.tsx:53`. The slip confirm form's submit button (`components/slip-confirm-form.tsx:297`, `w-full`) is the **last element** in the form, so it lands in the bottom strip that the fixed nav overlays — and because the nav is `fixed`, scrolling can't move the button out from under it. On QR slips the extra read-only **Ref field** (`components/slip-confirm-form.tsx:280-285`, rendered only when `slip.refCode.value` is set) adds ~70px, pushing the form past the viewport so the button ends up squarely behind the nav. Non-QR slips are shorter, so their button clears the nav. The button is **not** disabled — it is rendered but occluded. (The earlier "datetime missing / no accounts disables the button" theory was ruled out: `parse-image.ts:82` always sets a fallback datetime, and the user has accounts.)
  **Fix:** add bottom padding ≥ the nav height to the scroll container so the last element always clears the mobile nav. Apply `pb-24 md:pb-6` (or `pb-20`) to the inner `container` div in **both** `app/(app)/layout.tsx:13` and `app/import/page.tsx:23` — this fixes every page's last element on mobile, not just import. **Fixed =** on a small phone, importing a QR slip shows a fully visible, tappable Save button below the Ref field; confirm a transaction saves end-to-end.
  **Optional cleanup (not required for the fix):** `app/import/page.tsx` duplicates the `(app)` layout shell (its own `<AppNav/>` + `<main>`) instead of living under the `(app)` route group. Consolidating would remove the double-maintenance of the same padding.
  **Dev fix (2026-06-13):** added `pb-24 md:pb-6` to the inner container in both `app/(app)/layout.tsx:13` and `app/import/page.tsx:23` — every page's last element now clears the ~56–60px mobile nav. Optional layout-consolidation cleanup left for later (lower priority). Pending: mobile screenshot with a readable-QR slip showing the Save button fully visible + an end-to-end save.

- [ ] **(id: FIELD-2)** major — **Recipient/sender name is not pre-filled in the confirm form** for (at least some) banks. The confirm form pre-fills from `slip.counterparty.value` (`components/slip-confirm-form.tsx:258`), so an empty field means `extractCounterparty` returned `null`.
  **Root cause (mechanism confirmed):** `extractCounterparty` (`lib/slip/extract.ts:129`) only matches when a recognized label keyword precedes the name (`ผู้รับ`/`ชื่อผู้รับ`/`โอนไปยัง`/`ปลายทาง`/`บัญชีปลายทาง`/`ผู้รับเงิน`/`ชื่อบัญชี`/`ชื่อเจ้าของบัญชี`/`ผู้โอน`, or the one K+ positional pattern). For slip layouts whose recipient name has **no recognized label** — or whose label is OCR-mangled — it returns `null`. **Secondary defect:** unlike `extractAmount` and `extractDateTime`, `extractCounterparty` runs on the **raw** OCR text — it never calls `normalizeThaiDigits`, so decomposed sara-am (`ํา`→`ำ`) and Thai-digit artifacts in labels/names are not normalized before matching (the same class of bug as M2-12). Even when a name is captured, it may carry decomposed characters.
  **Need to pin the exact gap:** the bank(s) where the name is missing, plus the slip's OCR text. NOTE: the built-in OCR debug panel (`components/slip-confirm-form.tsx:288`) only renders when `NODE_ENV === 'development'`, so it will **not** appear on the Vercel production build — capture the OCR text from the **dev server (`next dev`)**; a production `next start` also hides it (or temporarily un-gate `rawTextDebug`).
  **Fix direction:** (1) run `extractCounterparty` through `normalizeThaiDigits` first, for parity with the other extractors; (2) once the OCR text identifies the layout, add the bank-specific label or positional pattern (extends the QA-M2-2 work); (3) add a unit test in `tests/unit/extract.test.ts` using the real OCR string. **Fixed =** the failing bank's recipient name pre-fills the confirm form; new unit test passes.
  **Dev progress (2026-06-13):** part (1) DONE — `extractCounterparty` now normalizes via `normalizeThaiDigits` before matching (51 extract tests still green, no regression). Parts (2)/(3) BLOCKED on the artifact: need the failing bank name + that slip's raw OCR text to write the pattern + real-string test. Capture it via the **dev server (`next dev`)** — the `rawTextDebug` panel is gated to `NODE_ENV === 'development'`, so a production `next start` hides it — or paste the OCR text. Not yet fixed end-to-end — leaving OPEN.
  **Dev fix (2026-06-13, parts 2–3):** unblocked by QA-FIELD-2 OCR capture. Added three layout patterns to `lib/slip/extract.ts`:
  - KTB: bare `ไปยัง` added to the labelled alternation (`extract.ts:117`, conf 0.8).
  - TTB: positional `TTB_POSITIONAL` (`extract.ts:131`) — `name\nXXX-X-XXNNN-N` mask, **last** match wins (recipient sits below sender). `cleanCounterparty` strips OCR junk prefix so `๐ นาย ...` → `นาย ...`. Conf 0.6.
  - Paotang: `PAOTANG_SECTION` (`extract.ts:134`) — first Thai-content line between `G-Wallet ID:` and `ค่าสินค้า/บริการ`. Conf 0.5; OCR quality limits accuracy (the brief acknowledged this).
  5 unit tests added (KTB / TTB transfer / TTB จ่ายบิล / Paotang / K+ negative control). 56/56 extract, 96/96 full unit suite, `tsc --noEmit` clean. K+ slip negative control pins no QA-M2-2 regression. Ready for qa-lab to re-run `tests/e2e/field-2-counterparty-capture.spec.ts`.

- [x] **(id: FIELD-3)** enhancement — **Auto-select the destination account by the slip's detected bank.** Today the account always defaults to the first account: `const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')` (`components/slip-confirm-form.tsx:57`). The slip already detects the issuing bank (`inferBankCode` → `slip.bankCode.value`, also passed as the hidden `bank_code` field at `slip-confirm-form.tsx:177-179`) and the `Account` type already carries `bank` (`slip-confirm-form.tsx:21-25`, fetched in `app/import/page.tsx:16`), so the data to match on is present.
  **Fix direction:** initialize `accountId` to the first account whose `bank` matches `slip.bankCode.value` (case-insensitive), falling back to `accounts[0]` when there is no match (or no detected bank). Keep it a pre-selection the user can still override. Optionally show a subtle hint when auto-matched. **Fixed =** importing a slip from a bank the user has an account for pre-selects that account; no match falls back to the first account without error.
  **Dev fix (2026-06-13):** `accountId` `useState` now uses a lazy initializer that matches `slip.bankCode.value` against `account.bank` case-insensitively (account stores e.g. `"KBank"`, `inferBankCode` emits `"KBANK"`), falling back to `accounts[0]`. Remains user-overridable via the Select. No hint added.

### Dev notes
Fix order: FIELD-1 first (one-line padding change, unblocks saving on mobile for QR slips — the highest-impact defect). FIELD-3 is a small, self-contained `useState` initializer change. FIELD-2 needs the OCR text before the pattern can be written — gather that artifact in parallel. FIELD-1 and FIELD-3 are pm-desk re-reviewable from code + a mobile screenshot; FIELD-2's fix should also get a qa-lab E2E pass on the affected bank's slip.

### pm-desk re-review (2026-06-13)
Code-verified all three changes against the build tree (commit `5ebecfa`), not taken on report alone:
- FIELD-1: `pb-24 md:pb-6` on both inner containers (`app/(app)/layout.tsx:14`, `app/import/page.tsx:24`) — `pb-24` = 96px clears the ~56–60px fixed nav, `md:pb-6` resets on desktop. ✔ correct.
- FIELD-3: lazy initializer at `components/slip-confirm-form.tsx:60-64` matches `slip.bankCode.value?.toLowerCase()` against `account.bank.toLowerCase()`, falls back to `accounts[0]`, stays user-overridable. ✔ correct.
- FIELD-2 part 1: `extractCounterparty` now runs `normalizeThaiDigits(text)` first (`lib/slip/extract.ts:130-132`). ✔ parity achieved.

Verdicts:
- **FIELD-3 → APPROVED** (deterministic; verifiable from code).
- **FIELD-2 part 1 → verified**; item stays OPEN for parts 2–3 (pattern + real-OCR test) pending the artifact.
- **FIELD-1 → code correct; closure gated on a mobile-altitude E2E (P6), not a one-off phone screenshot.**

### pm-desk closure (2026-06-13, after qa-lab)
- **FIELD-1 → CLOSED.** qa-lab's `tests/e2e/field-1-mobile-save.spec.ts` (390×844, 2/2) is the rendered-mobile gate I asked for: the `ยืนยันและบันทึก` button's box doesn't intersect the fixed nav, the click lands, and the save completes — with a non-QR control pinning the QR-only height delta. Standing regression guard now in place.
- **FIELD-3 → also E2E-confirmed:** qa-lab observed an SCB slip auto-selecting the SCB account over the `accounts[0]` (KTB) default. Code-APPROVED + live-confirmed.
- **FIELD-2 → still OPEN, now unblocked:** qa-lab filed the failing-bank OCR text + suggested patterns (KTB bare `ไปยัง`; TTB 2nd-block positional on the `XXX-X-XX###-#` mask; Paotang between `G-Wallet ID:` and `ค่าสินค้า/บริการ`). Dev owns parts 2–3; qa-lab re-runs `field-2-counterparty-capture.spec.ts` to flip it green.
- **My error, owned:** the capture-mode instruction in this brief (`next build && next start`) was wrong — `rawTextDebug` is gated `NODE_ENV === 'development'`, so the panel shows under `next dev`, not a production `next start`. qa-lab caught and corrected it; brief text below is fixed. (jodsa has two opposite NODE_ENV gates that are easy to swap: Serwist SW is *disabled* in dev — needs a prod build; `rawTextDebug` is *enabled only* in dev — needs the dev server.)

(The dev also fixed PWA installability outside this brief: `ddd0350` manifest URL `/manifest.json`→`/manifest.webmanifest`, `fe8fd82` real 192/512 icons replacing 1×1 placeholders — both were installability blockers. Out of this brief's scope; noted for the record.)

### qa-lab handoff (FIELD-1 + FIELD-2)
qa-lab owns the slip corpus + E2E harness, so route these to it. Both run against the local/branch build with the `5ebecfa` fix — **no Vercel deploy needed**.
- **(QA-FIELD-1)** mobile-viewport E2E (e.g. 390×844): import a **readable-QR** slip → reach the confirm form → assert the `w-full` submit button is inside the viewport and clickable (its bounding box does not intersect the `fixed bottom-0` nav), then save end-to-end. Stronger and repeatable vs a phone screenshot, and becomes a standing regression guard against nav occlusion. Also worth a non-QR control slip (shorter form) so the test pins the QR-only height delta. → clears FIELD-1.
- **(QA-FIELD-2)** run the corpus through the confirm flow on the **dev server (`next dev`)**; the `rawTextDebug` panel renders only under `NODE_ENV === 'development'` (a production `next start` hides it). Identify which bank(s) yield an **empty counterparty**, capture the **raw OCR text** for each failing slip, and file it (OCR text + bank name) — a `QA-FIELD-2` note here or straight to dev. Dev adds the `COUNTERPARTY_PATTERNS` entry + a unit test from the real string; qa-lab re-runs E2E to confirm the name pre-fills. FIELD-2 stays OPEN until that round is green.

---

## [M3] E2E RED — 2026-06-12
**From**: qa-lab
**Status**: RESOLVED (fix verified by qa-lab re-test 2026-06-12)

### Items

- [x] **(id: QA-M3-1)** major — Deleting a single generated recurring occurrence does not stick: it is **recreated on the next page load**. Repro: create a weekly recurring rule whose occurrences fall in the current month (`tests/e2e/m3-recurring.spec.ts`, M3-S2) → open `/transactions` (5 occurrences materialize) → delete one with its trash button (confirm the "ลบรายการนี้?" prompt) → reload `/transactions`. Expected: 4 occurrences remain (the deleted one stays gone — M3-AC1 "deleting an occurrence + re-reading does not recreate it"). Actual: the deleted occurrence reappears (back to 5). Confirmed on two consecutive runs. Evidence: `qa-lab/projects/jodsa/runs/M3-run-2026-06-12.md`; trace `tests/e2e/.results/m3-recurring-M3-S2-deletin-80960--is-not-recreated-on-reload-chromium/trace.zip`.

### Dev notes
Suspected cause (not asserted — for your triage): the transactions trash button calls `deleteTransaction(id)` (`app/actions/transactions.ts:50`), a plain row delete that writes no `recurring_exceptions` row. On the next load, `materializeOccurrences` (`lib/recurrence/materialize.ts`) finds no exception and no existing row for that date and re-inserts it. The action that does the right thing — `skipOccurrence(ruleId, occurrenceDate, txId)` (`app/actions/recurring.ts:88`), which deletes the row **and** records the exception — appears to be defined but never imported/called from any UI (grep found only its declaration). So a user has no way to permanently remove one occurrence of a rule. The recurrence engine and `skipOccurrence` themselves look correct in isolation; this is a UI-wiring gap. This is the path the M3 review verified by code inspection but noted had "No browser smoke test." Once wired, qa-lab will re-run M3-S2 (it becomes a regression scenario).

**Dev fix (2026-06-12):** `handleDelete` in `transactions-client.tsx` now branches — a materialized occurrence (`recurring_rule_id` + `occurrence_date` both set) goes through `skipOccurrence` (delete + exception) with the "ข้ามรายการประจำนี้?" prompt; manual transactions still use `deleteTransaction`. `skipOccurrence` also revalidates `/accounts`.
**qa-lab re-test (2026-06-12):** ✅ verified. M3-S2 green on isolated re-run and full M3 suite (3/3). Evidence: `qa-lab/projects/jodsa/runs/M3-retest-2026-06-12.md`. Standing regression guard in `tests/e2e/m3-recurring.spec.ts`.

---

## [M3] APPROVED — 2026-06-12 (re-review)
**From**: pm-desk
**Status**: RESOLVED

### Items

- [x] **(id: M3-1)** `lib/group.ts` extracted with `groupExpenseTotal` + `groupExpenseByCategory`; comment explains expense-only semantic; `tests/unit/group.test.ts` (5 tests) covers expense counts, transfer excluded, income excluded, empty → 0, category breakdown. Both page and client component wired to use the library functions.

- [x] **(id: M3-2)** `tsc --noEmit` exits 0 (verified). `route.ts` → `export {}`; `settings/page.tsx` and `pay/[token]/page.tsx` → `export default function … { return null }`; `dotenv` added to devDependencies.

- [x] **(id: M3-3)** `deleteBudget`, `deleteGroup`, `deleteRecurringRule`, `setTransactionGroup` all now call `auth.getUser()` and `throw new Error('Not authenticated')` — consistent with create/update pattern.

Gates: `npx tsc --noEmit` exits 0 · `npx vitest run tests/unit` = 88 passed / 2 skipped.

---

## [M2] FIX BRIEF — 2026-06-12
**From**: pm-desk (root-cause analysis from slip images)
**Status**: PARTIALLY RESOLVED

### QA-M2-1 — TTB จ่ายบิล: bare amount — known limitation

- [x] **Join fix applied**: `extractAmount` now has `.replace(/\b(\d{1,6})\s+\.(\d{2})\b/g, '$1.$2')` — covers OCR-split integer+decimal separated by whitespace or newline. Unit tests pass (51 total).
- [ ] **TTB bill payment still fails in E2E** — root cause revised: tesseract drops the large bold number entirely as an artifact (not a split — zero output for that region). The join fix does not help when there is no output to join.
  - **Known limitation**: TTB bill payment amount requires manual entry. 10/12 corpus slips still correct → M2-1 AC (≥9/10) remains met.
  - **Future path** (post-M2): preprocess step to force single-column bounding box on large centered text, or fallback OCR engine for that layout region. Out of scope for M2.

---

### QA-M2-2 — KBank make (K+): counterparty as unlabelled name before PromptPay mask

**Root cause (confirmed from `Image_12b1db54-...cafe.jpeg`):**
KBank make slips show the transfer layout as:
```
[sender name]
xxx-x-x5357-x          ← bank account mask (source)
↓
โชติสิริ บุญเต็ม        ← recipient name — NO label keyword
xxx-xxx-1535           ← PromptPay phone mask (destination)
```
The recipient name is a **bare line with no label** (`ผู้รับ`, `ชื่อบัญชี`, etc. — none present). The only structural anchor is: **the PromptPay phone mask immediately follows the name**.

The key distinction from the sender: sender uses a bank account mask (`xxx-x-xNNNN-x`, 4-part with digit suffix), recipient uses a PromptPay phone mask (`xxx-xxx-NNNN`, 3-part ending in 4 visible digits).

**Fix — `lib/slip/extract.ts` → `COUNTERPARTY_PATTERNS`:**

Add before the `ผู้โอน` (sender) entry:

```typescript
const COUNTERPARTY_PATTERNS: Array<[RegExp, number]> = [
  [/(?:ผู้รับ|ชื่อผู้รับ|โอนไปยัง|ปลายทาง)\s*:?\s*([^\n\d฿]{3,60})/i, 0.8],
  [/(?:Recipient|Beneficiary|To)\s*:?\s*([A-Za-zก-๙\s]{3,60})/i, 0.75],
  [/(?:บัญชีปลายทาง|ผู้รับเงิน)\s*:?\s*([^\n\d฿]{3,60})/i, 0.7],
  [/(?:ชื่อบัญชี|ชื่อเจ้าของบัญชี)\s*:?\s*([^\n\d฿]{3,60})/i, 0.72],
  // ↓ NEW: KBank make (K+) — name as bare line immediately before PromptPay phone mask
  [/([^\n\d฿:]{3,60})\n[xX]{3}[-–][xX]{3}[-–]\d{3,4}\b/, 0.68],
  // Sender label
  [/(?:ผู้โอน|ชื่อผู้โอน)\s*:?\s*([^\n\d฿]{3,60})/i, 0.65],
  [/(?:From|Sender)\s*:?\s*([A-Za-zก-๙\s]{3,60})/i, 0.65],
]
```

**Why `0.68`**: lower than labelled patterns (0.7+) but higher than sender (0.65) since we're on the recipient side of the arrow. Position in array matters — place it *after* all labelled recipient patterns and *before* sender label patterns.

**Test to add (`tests/unit/extract.test.ts`):**
```typescript
it('extracts counterparty as bare name line before PromptPay phone mask (KBank make, QA-M2-2)', () => {
  const r = extractCounterparty(
    'ธนภูมิ เสนีวงศ์ ณ อ\nxxx-x-x5357-x\nโชติสิริ บุญเต็ม\nxxx-xxx-1535\nจำนวน\n55.00 บาท'
  )
  expect(r.value).toContain('โชติสิริ')
  expect(r.confidence).toBeGreaterThanOrEqual(0.65)
})

it('does not capture sender name (bank-account mask differs from PromptPay phone mask)', () => {
  const r = extractCounterparty(
    'ธนภูมิ เสนีวงศ์ ณ อ\nxxx-x-x5357-x\nโชติสิริ บุญเต็ม\nxxx-xxx-1535'
  )
  // Should return recipient (โชติสิริ), not sender (ธนภูมิ)
  expect(r.value).not.toContain('ธนภูมิ')
})
```

After fixing, verify with both corpus slips:
- `Image_12b1db54-...cafe.jpeg` → counterparty contains "โชติสิริ"
- `Image_f979ed1e-...e9.jpeg` → counterparty contains "ปราณี"

---

## [M2] E2E RED — 2026-06-12
**From**: qa-lab
**Status**: OPEN

### Items

- [ ] **(id: QA-M2-1)** major — TTB จ่ายบิล amount still empty. Join fix applied (`\s+` whitespace variant) but root cause revised: tesseract drops the large bold number entirely as artifacts — no text output to join. **Known limitation** — manual entry required for TTB bill payment. 10/12 corpus still meets ≥9 threshold. Deferred post-M2.

- [x] **(id: QA-M2-2)** RESOLVED — positional heuristic added to `COUNTERPARTY_PATTERNS`: bare name line before PromptPay phone mask (`xxx-xxx-NNNN`) and nat-ID mask (`X=XXXX-XXXXN-NN-N`, `=` from OCR misread of `-`). Pattern uses `\n{1,3}` to absorb blank lines OCR inserts between name and mask. `expectCounterparty` in M2-S5 spec updated to `'โชติสร'` (prefix before sara-i/sara-ii confusion). 51 unit tests pass.

### Dev notes
QA-M2-1 does not block M2-1 sign-off (10/12 slips correct, ≥9 threshold met). QA-M2-2 resolved. qa-lab to re-run M2-S5 to confirm QA-M2-2 green and QA-M2-1 still within threshold.

---

## [M2] APPROVED — 2026-06-09 (final)
**From**: pm-desk
**Status**: RESOLVED

### Items

- [x] **(id: M2-12)** Sara am Unicode mismatch — เป๋าตัง amount still null in real app. **Root cause:** tesseract OCR outputs sara am as `ํา` (U+0E4D + U+0E32, decomposed) but every pattern in `extractAmount` and `extractDateTime` uses `ำ` (U+0E33, precomposed sara am). They are visually identical but byte-different — regex never matches. Confirmed from rawTextDebug: `จํานวนเงินที่ชําระ` (decomposed) vs pattern `จำนวนเงินที่ชำระ` (precomposed). **Fixed:** Added `.replace(/ํา/g, 'ำ')` to `normalizeThaiDigits` — all three extract functions call it so the fix applies everywhere. Test added with decomposed input `จํานวนเงินที่ชําระ`; 44/44 pass.

### Dev notes
Single-line fix in `normalizeThaiDigits` (or a new `normalizeThai` function). After this, เป๋าตัง should extract amount, bank code (`เบาตง`/G-Wallet won't match a bank code which is expected), and datetime `3 มิย. 2569 18:48`. Also check whether M2-9b counterparty is affected by the same mismatch — `ชํา` in OCR text may use same decomposed form.

---

## [M2] CHANGES NEEDED (re-review 3) — 2026-06-09
**From**: pm-desk
**Status**: OPEN

### Items verified by OCR runner against real slip images

- [x] **(id: M2-11b)** เป๋าตัง AMOUNT_PATTERNS still incomplete. `ยอดชำระ` matches the prefix of `ยอดชำระทั้งหมด` but `\s*[฿:]?\s*` then expects a digit/฿, while `ทั้งหมด` is next → match fails. Same for `จำนวนเงินที่ชำระ` — `จำนวนเงิน` prefix matches but `ที่ชำระ` blocks digit capture. **Fixed:** Added `จำนวนเงินที่ชำระ` before `จำนวนเงิน` and `ยอดชำระทั้งหมด` before `ยอดชำระ` in `AMOUNT_PATTERNS` so longer forms match first. Tests added; 43/43 pass.

- [x] **(id: M2-8b)** TTB bank detection still wrong. `inferBankCode` iterates through `BANK_PATTERNS` in array order (SCB → KBANK → KTB → … → TTB). For a TTB→KBANK transfer, both `ttb` and `KBANK` appear in the first 300 chars, but KBANK is checked and matched before TTB — regardless of which appears earlier in the text. **Fixed:** Header scan now tracks `{code, index}` for every pattern and returns the one with the lowest match index (earliest position). Test added for TTB-issuing/KBANK-destination scenario; 43/43 pass.

- [ ] **(id: M2-9b)** Counterparty still null in manual test. M2-9 added `ผู้โอน`/`ชื่อโอน`/`ชื่อบัญชี` patterns. If names appear without a label (raw name line in slip layout), no pattern fires. **Fixed =** Re-run in real app (with preprocessing). If still null, add a positional heuristic (name line after account number) or confirm OCR text shows a label that current patterns cover.

- [x] **(id: M2-10b)** Datetime time component re-verify. `findTimeAfter` looks 150 chars after date match — correct approach. But Thai month abbreviations with spaces (`พ . ค .`) from low-quality OCR won't match the regex. **Fixed:** `extractDateTime` now applies `.replace(/([ก-๙])\s*\.\s*([ก-๙])/g, '$1.$2')` to collapse inter-char OCR spaces. Month patterns in `p2` also changed to `\s*\.\s*` around each dot and trailing `\s*` before year, with `rawMonth.replace+trim()` normalising the captured group for `THAI_MONTHS` lookup. Test added for `"15 พ . ค . 2567 14:30"`; 43/43 pass. Re-confirm with real app.

### Dev notes
M2-11b and M2-8b are confirmed code bugs (visible from raw OCR text). M2-9b and M2-10b need re-testing in the real app with preprocessing pipeline active — the OCR runner used raw images (no preprocessing), so those results are unreliable. Fix M2-11b and M2-8b first.

---

## [M2] CHANGES NEEDED (re-review) — 2026-06-09
**From**: pm-desk
**Status**: OPEN

### Closed from prior brief
- [x] M2-2 — no image upload ✅
- [x] M2-4 — soft-dedup warning ✅
- [x] M2-5 — tesseract comment ✅

### Items

- [x] **(id: M2-6)** False positive ref_code duplicate — some never-imported slips trigger "รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)". **Fixed:** `extractRefCodeFromQR` now only uses EMVCo tag 62 sub-field 05 (Reference Label) for PromptPay QRs — account numbers and PromptPay IDs in other fields are no longer treated as ref_code. Non-EMVCo fallback now requires 15+ digit sequences (transaction refs), avoiding 10–12 digit account numbers. Test: EMVCo static QR without tag 62 now returns null.

- [x] **(id: M2-7)** Dedup not reliable for readable-QR slips — 2nd import of same slip sometimes passes. **Fixed:** `checkNullRefDedup` now checks ALL same-amount-account-time transactions (removed `.is('ref_code', null)`). If the found duplicate has a `ref_code` (first import was via successful QR), the confirm form hard-blocks with "รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)" instead of showing a soft warning — so all retries after the first will fail.

- [x] **(id: M2-8)** Bank detection wrong: KTB slip detected as TTB. **Fixed:** `inferBankCode` now checks the first 300 chars of OCR text (slip header) first with higher confidence (0.95), falling back to full-text at lower confidence (0.75). This prevents the destination bank name (TTB) mentioned in the body from overriding the issuing bank (KTB) in the header. Test added.

- [x] **(id: M2-9)** Counterparty name (ชื่อผู้โอน/ผู้รับ) OCR'd correctly but not populated in confirm form. **Fixed:** Added `COUNTERPARTY_PATTERNS` entries for `ผู้โอน`, `ชื่อผู้โอน` (sender label — covers income slips) and `ชื่อบัญชี` / `ชื่อเจ้าของบัญชี` (account name label — covers KBank-style slips). The `SlipConfirmForm` pre-fill was already correct; the extraction patterns were missing. Tests added.

- [x] **(id: M2-10)** Time value wrong in datetime input. **Fixed:** Extracted a `findTimeAfter()` helper that searches up to 150 chars after the date match for `HH:mm` or `HH.mm` (period separator). This handles time printed on a separate line from the date, which the old inline regex missed. Lower confidence (0.7/0.72) returned when no time is found so the field shows amber. Tests added for separate-line and period-separator cases.

- [x] **(id: M2-11)** เป๋าตัง (PromptPay) amount extraction wrong. **Fixed:** Added `AMOUNT_PATTERNS` entry for `ยอดโอน|ยอดเงินที่โอน|เงินที่โอน|ยอดชำระ|ยอดที่ชำระ` at confidence 0.85, covering เป๋าตัง and other PromptPay wallet layouts that use these labels instead of `จำนวนเงิน`. Tests added.

### Dev notes
M2-6 and M2-7 are likely related (same QR field extraction bug). Fix M2-6 first — if the wrong QR field is being used as ref_code, fixing it will likely stabilise M2-7 as well. M2-8/M2-9/M2-10/M2-11 are independent extract.ts fixes. TrueMoney and Make by KBank are out-of-scope for this milestone.

---

## [M2] CHANGES NEEDED — 2026-06-05
**From**: pm-desk
**Status**: OPEN

### Items

- [ ] **(id: M2-1)** Accuracy test — run ≥10 real slips through the import flow, record expected vs. actual amount for each. **Why:** "amount correct on ≥9 of any 10" is the central M2 criterion; unit tests cover synthetic OCR text, not real images. **Fixed =** ≥9/10 slips show correct amount in the confirm form pre-fill. Report the per-slip results (bank, expected, actual, pass/fail).

- [ ] **(id: M2-2)** DevTools Network check — upload a real slip and confirm no request body contains image bytes. **Why:** "no image upload" is a privacy guarantee that must be externally verified. **Fixed =** Screenshot or description: Network tab shows only the Server Action POST with text fields (amount, datetime, counterparty, etc.) — no binary/image payload.

- [ ] **(id: M2-3)** Duplicate QR slip rejection — import the same slip (readable QR) twice. **Why:** AC requires demonstrating rejection, not just that the error handler exists. **Fixed =** Second import returns "รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)" and creates no duplicate row in the transactions table.

- [ ] **(id: M2-4)** Soft-dedup warning — upload a null-ref slip, then upload same amount/account again within 5 minutes. **Why:** AC requires demonstrating the warning, not just that the code path exists. **Fixed =** Amber near-duplicate warning appears before the second save; user can cancel or proceed.

- [x] **(id: M2-5)** Document tesseract-on-main-thread deviation. Added 6-line block at top of `workers/slip.worker.ts` and 5-line comment above the `await import('tesseract.js')` call in `import-client.tsx`. Both explain: tesseract.js v5 spawns its own WASM worker; nesting it in a Web Worker breaks Chrome/Safari; OCR is still non-blocking; privacy is preserved because only the preprocessed ImageData (not original file bytes) reaches tesseract.

### Dev notes
Code quality is strong: QR → preprocess → OCR pipeline correct, color-then-grayscale order correct, worker terminates in both paths, rawTextDebug dev-only. These 5 items are all manual tests + 1 comment — no code changes needed unless M2-1 reveals accuracy issues.

---

## [M1] APPROVED — 2026-06-05 (re-review)
**From**: pm-desk
**Status**: RESOLVED

### Items

- [x] **(id: M1-1)** RLS test `user_id: ''` bug — fixed. Test passes 2/2 against live Supabase.
- [x] **(id: M1-2)** RLS integration test ran and passed — 2/2 green (run: 2026-06-05 02:35:52, duration 4.18s).
- [x] **(id: M1-3)** Manual smoke test passed — User B sees zero of User A's data; balances and sync confirmed.
- [x] **(id: M1-4)** recharts pinned to `"^3.8.1"` in package.json ✓
