# REVIEW-INBOX

Briefs from reviewer agents: correction briefs from pm-desk, E2E bug briefs from qa-lab (ids `QA-*`),
spec changes from idea-forge (`SPEC-*`). Newest on top; **open items above closed history**.
Dev session: work through OPEN items, mark each `[x]` and note what was done, then ask the sender for a
re-check (qa-lab re-tests `QA-*` items; pm-desk re-reviews the rest).

<!-- all paths in this file are relative to workspace root E:\claudeWorkSpace -->

> **Pruned 2026-07-17 by pm-desk** (1316 → this). Resolved blocks were cut, not archived: every durable
> record survives in `pm-desk/projects/jodsa/reviews/` and `qa-lab/projects/jodsa/runs/` (both versioned
> in git). Each CLOSED line below cites its record. Open items were carried forward verbatim in substance.

---

# OPEN

## [SPEC-4] `/invest` module — **1 milestone unbuilt** — 2026-07-14 · from idea-forge
**Status**: OPEN — GREENLIT Phase-2 build, **cannot close until M2 lands**. Builds INTO this app as the
`app/(app)/invest/` route group — not a fresh scaffold. Blueprint audited **SHIP, 0 blockers**.

**Authoritative spec (read in order):** `idea-forge/ideas/jodsa-investments/prompt.md` →
`docs/01-definition.md` (what/who/**non-goals**) → `docs/02-architecture.md` → `docs/04-roadmap.md`
(M0–M5 + acceptance) → `docs/05-risks.md` · `docs/06-audit.md`.
M5 analysis methodology: `Resources/portfolio-risk-review/portfolio-risk-methodology.md` (workspace root
— *not* `fin-desk/Resources/...`, which does not exist).

**Firm non-goals:** no order execution / broker integration **ever** · no paid market-data API in MVP
(manual prices) · not licensed advice · multi-tenant RLS isolation per new table.

### The only open milestone
- [ ] **M2 — Broker-Screenshot OCR** · complexity M · deps M1 (done) · **prereq: ~10 real Dime
  screenshots** — not yet collected; no corpus, no objective exit.
  Reuse the on-device worker; **image never uploaded**; ≥85% position-value correct; confirm grid with
  low-confidence flags.
  **Build note (from the Fable review):** `workers/slip.worker.ts` does QR/preprocess only (nested-WASM
  breaks Chrome/Safari); tesseract runs main-thread via dynamic import (`lib/slip/parse-image.ts`).
  `workers/portfolio.worker.ts` must copy that split — row-segmentation grammar is genuinely new work.
  **Verified unbuilt 2026-07-17:** no `workers/portfolio.worker.ts` on disk.

### Done (see CLOSED history for the verdict records)
M0 gate PASS · M1 · M3 · M5 — all code+unit APPROVED **and** qa-lab GREEN; migrations `0008` + `0009`
applied live; deployed.

### Residual non-blocking notes (pm-desk `INVEST-M5`, forward notes — **not correction items**)
- [ ] **NO-TRADE regression coverage is the degenerate (exactly-on-target) case only.** Suggest a third
  fixture with real within-band drift (~±2–3pt) asserting `no_trade`, to pin `UNDERWEIGHT_THRESHOLD`
  against a future edit. Verified passing today. Ref: `tests/unit/invest/planner/plan.test.ts:170`.
- [ ] **`lib/invest/planner/plan.ts:130` `ASSET_CLASSES[0]` fallback — unreachable today, latent tomorrow.**
  A look-through-only concentrated row would get a silently mislabeled `assetClass`. Proved unreachable
  now (max table weight 0.09 vs the 25% flag). Becomes live only if the look-through table gains a >25%
  constituent. Worth an explicit `continue` or a comment.
- [ ] **`proxy-params.json` `annualVol` is dead config** — zero consumers (`stress.ts` reads only
  `stressScenarios`). It is exactly the input a VaR/vol calc would need, sitting unused, and M0's
  guardrail forbids that surface. Remove it, or annotate "intentionally unconsumed — see M0 guardrail"
  so a future session doesn't read it as an invitation.
- ✅ *Forward note 1 (plans immutability untested) — RESOLVED by `c646e93`: `plans.Update` typed `never`
  + a live RLS assertion that the DB denies an owner's own update. RLS suite 34/34.*

---

## [SPEC-3] Phase 2 backlog — M10–M13 (Push · CSV · BYO Vision · Realtime) — 2026-07-14 · from idea-forge
**Status**: **PARKED** — blueprinted, **not the active target**. 2026-07-14 the owner chose the investment
module (SPEC-4) as the Phase-2 build instead. Keep M10–M13 as planned backlog; **do NOT start M10** until
the owner re-prioritizes. Net-new phase, not a fix to M1–M9.

**Ordering & why (when resumed): M10 → M11 → M12 → M13** — engagement + quick-win first; the two items
that **reverse an MVP non-goal** go last, each behind an explicit opt-in.

**Authoritative spec:** `idea-forge/ideas/jodsa/docs/04-roadmap.md` §"Phase 2" (deliverables +
acceptance) · `docs/02-architecture.md` §"Phase 2 subsystems" (the 🔴 cron service-role carve-out + the
two non-goal reversals) · `docs/05-risks.md` §"Phase 2 additions". The frozen snapshot at
`project/jodsa/docs/source-idea/` predates this phase — the live `idea-forge/ideas/jodsa/docs/` wins.

- [ ] **M10 — Push Notifications (Web Push + Vercel Cron)** · L · deps M9 + M7-D. VAPID +
  `push_subscriptions` (owner RLS) + Serwist `push`/`notificationclick`. Delivery via
  `app/api/cron/notify/route.ts` (`CRON_SECRET`-gated) using `web-push`; daily reminder 12:00/22:00 ICT
  (= 05:00/15:00 UTC) + recurring-due "จ่ายยัง?" confirm (Confirm keeps the row; Skip writes
  `recurring_exceptions` **and reverses** the materialized occurrence — idempotent, reconciles with the
  M7-D lazy materializer, never double-deducts) + optional budget-over-limit (stretch).
  🔴 **The cron route is the ONE sanctioned server-side service-role path** (system trigger, no user
  input) — import the service-role client **only** under `app/api/cron/`; M10 acceptance includes a grep
  guard that nothing else does. iOS Web Push needs an installed PWA (16.4+) — say so in settings.
- [ ] **M11 — CSV Export** · S · deps M9. Client-side only (no infra/schema): Settings → Export,
  date+type filter → in-browser CSV Blob download; satang→baht at format time; **UTF-8 BOM** for Excel
  Thai; RLS-scoped to the signed-in user.
- [ ] **M12 — BYO Vision Key** ⚠️ *reverses "no server AI vision"* · M · deps M2. Opt-in, default OFF; key
  stored **only in the browser**, **browser calls Google Vision directly** — key never hits a JodSa
  origin. Only the OCR text source changes; `lib/slip/extract.ts` unchanged; any failure falls back to
  Tesseract. Mandatory one-time privacy acknowledge (image leaves device).
- [ ] **M13 — Realtime Live-Sync** ⚠️ *reverses "sync-on-load only"* · L · deps M9. Supabase Realtime
  `postgres_changes` on the **authenticated** client (RLS filters the stream); lazy (not in first paint),
  subscribe-on-focus + reconnect-on-resume, patch TanStack Query cache. **Security-critical:** ship a
  2-user realtime-over-websocket isolation test (mirrors M4 anon-deny).

**Before writing M10 feature code:** confirm resolved versions of any new deps (`web-push`; Google Vision
is a REST call, no SDK) against the React 19 / Next 15 lockfile, and add `.env.example` entries
(`*_VAPID_*`, `CRON_SECRET`) — same discipline as `START-HERE.md`.

---

## Open harness / user items

- [ ] **(id: QA-M7-H1)** [qa-lab harness — **not an app/dev defect**, non-blocking] — the M7/M3 E2E specs
  share one test user + a mixed reset strategy, so a consolidated one-shot run is order-flaky:
  `tests/e2e/m3-recurring.spec.ts` fails right after the OCR-heavy `m7-dup-override`, passes in
  isolation. qa-lab owns hardening its own suite. Open since 2026-07-11; out of scope of the
  2026-07-14 regression sweep (which hardened its sibling QA-M9-H1).
- [ ] **(id: M9-USER-1)** [user config step, non-blocking] — set `NEXT_PUBLIC_SITE_URL` in the Vercel env
  **and** add it to Supabase → Auth → Redirect URLs, so the `89f59e8` signup email-redirect resolves on
  prod. *pm-desk cannot verify Vercel/Supabase dashboard state from the repo — left open as unverified.*

---

## Known limitations (slip parser) — accepted, deferred realities · **not live bugs**

These are ruled scope decisions, not open work. Each is guarded by a standing regression assertion so it
can't silently get worse. Durable records: `pm-desk/projects/jodsa/reviews/M2-review.md` ·
`qa-lab/projects/jodsa/runs/{FIELD-2-close,M2-S5-retest}-2026-06-13.md`.

- **TTB จ่ายบิล amount → manual entry** (was `QA-M2-1`). Root cause: tesseract **drops the large bold
  number entirely** as an artifact — there is no text output for that region, so the OCR-split join fix
  (`extractAmount`'s `\d+\s+\.\d{2}` collapse) cannot help. 10/12 corpus slips still correct → M2's
  ≥9/10 acceptance holds. *Future path (post-M2, out of scope):* force a single-column bounding box on
  large centered text, or a fallback OCR engine for that layout region.
- **Biller NAME on bill payments → not extracted, field falls through to empty** (was `FIELD-2` /
  `QA-FIELD-2a` item 1, and the older `M2-9b`). **Scoped out by pm-desk verdict 2026-06-13** for
  **both TTB and KTB**: billers are id-based (`(NNNN…)`) with no name mask or label anchor; chasing them
  invites wrong captures, and **wrong-but-plausible is worse than empty**. `TTB_POSITIONAL` deliberately
  requires **≥2 mask matches** before firing — transfers carry two blocks (sender+recipient → last =
  recipient ✓), bills carry one (sender only) → fallback skipped → empty.
  ⚠️ **Do not "fix" this by loosening the ≥2 gate** — that regresses to showing the payer their own name.
- **Paotang merchant is best-effort** (confidence 0.5, the lowest tier). OCR quality on Paotang is poor
  — captures degrade (`ร้านสุกี้ รสเด็ด` → `รานสุก รสเดด`). The `G-Wallet ID:` anchor tolerates OCR
  variants (`[I!1l][D0]`, optional hyphen). Not a blocker by ruling.
- **`detectSourceApp` make/kplus/ktbnext patterns are best-effort** — only Paotang and ttb have
  corpus-verified brand text. Doesn't affect acceptance: `number_hint` ranks **above** app-signature in
  `resolveAccountDefault`, so MAKE-vs-KBank disambiguation works regardless.

**Standing regression guard:** `tests/e2e/field-2-counterparty-capture.spec.ts` — transfers/merchants
**must** pre-fill the recipient (KTB 3/3, TTB 2/2, KBank 2/2, Paotang 3/3); TTB & KTB **bills must stay
empty** (guards the sender from ever returning); Paotang `G-Wallet !0:` → `ปราณี`.

---

## Repo gotchas — **permanent; read before touching schema, routes, or the OCR panel**

- 🔴 **`drizzle-kit generate` is broken in this repo.** Every migration from `0007` on is **hand-authored
  SQL with RLS inline** (`0007`, `0008`, `0009` all were). `db/migrations/meta/_journal.json` is **stale**
  (lists only through idx 4) and there is a duplicate-numbered `0005` pair. Write the next migration by
  hand; update `db/schema.ts` + `lib/supabase/types.ts` to match by hand too.
- 🔴 **Never auto-apply a migration to live Supabase — surface it for owner sign-off.** When authorized,
  `0008`/`0009` were applied atomically via **postgres.js simple-protocol**, not drizzle-kit. Expect the
  new table's RLS suite in `tests/unit/rls.test.ts` to error at `beforeAll` with
  `Could not find the table 'public.<x>'` until the migration lands — that is the **expected** pre-apply
  state, not a regression.
- 🔴 **Runtime user data flows only through `supabase-js` + the user session** so RLS applies. Never
  Drizzle / direct connection / service-role on a request path. New tables ship RLS enabled + full owner
  policies + a **live 2-user isolation test** before merge.
- **New routes go in `app/(app)/<route>/`** — inside the auth-guard group (`app/(app)/layout.tsx`). A
  top-level `app/<route>/` renders with **no auth and no nav**. Nav v3 is a fixed 4-dest + FAB bar, so a
  new destination enters via `/more` + the desktop sidebar.
- **Design authority = `idea-forge/ideas/jodsa/docs/07-design.md` (v3)** — **not** the v1 snapshot at
  `project/jodsa/docs/source-idea/docs/07-design.md`. v3 tokens are live in `app/globals.css` since M9.
- **Money layers are separate and both are integer minor units, never floats.** `lib/money.ts` = THB
  satang, `integer` (int4) columns, expense core. `lib/invest/money.ts` = multi-currency + FX-at-cost,
  **`bigint`** columns (do not copy the int4 pattern — it caps at ~฿21.4M in satang). `tsconfig.json`
  targets **ES2020** specifically so bigint literals (`0n`) type-check. `decimal.js` is deliberately
  **not** a dependency — every ratio in the planner is already an approximate/proxy input.
- **Two opposite `NODE_ENV` gates that are easy to swap:** the Serwist SW is **disabled in dev** (needs a
  prod build to test); `rawTextDebug`, the OCR debug panel, is **enabled only in dev** (`next start`
  hides it — capture OCR text via `next dev`).
- **Recharts must stay out of `/dashboard` and `/invest` first-load chunks.** Verify by grepping every
  chunk `.next/app-build-manifest.json` lists for that page — don't take the bundle summary on faith.
- **Supabase free tier pauses after ~7 days idle** — an E2E/RLS suite failing to connect may just mean the
  project is paused.

---

# CLOSED — history (one line each; the cited record is the durable evidence)

**Expense core — M1–M9 COMPLETE 🎉 (2026-07-13).**
- **M9** CLOSED 2026-07-13 — UX Reset design v3; code+unit APPROVED + QA-M9 prod-build E2E GREEN, both
  independently re-verified. `pm-desk/projects/jodsa/reviews/M9-review.md` ·
  `qa-lab/projects/jodsa/runs/QA-M9-2026-07-13.md`.
- **M8** CLOSED 2026-07-12 — Smart Account Mapping; `0007` applied live; QA-M8 GREEN (live-RLS 18/18 +
  prod-build E2E). `reviews/M8-review.md` · `runs/QA-M8-2026-07-12.md`. (`M8-USER-1` resolved.)
- **M7** CLOSED 2026-07-11 — Ledger Correctness & Editing; QA-M7 prod-build E2E GREEN.
  `reviews/M7-review.md` · `runs/QA-M7-2026-07-11.md` · post-mortem
  `project/jodsa/docs/postmortems/M7-D-recurring-never-deducts.md`. (`M7-USER-1` closed 2026-07-17 by
  `67175fc` — the recurring fix is in the deployed line, prod-verified by QA-M7.)
- **SPEC-1** (idea-forge, 2026-07-07 field-feedback round 2 → M7/M8/M9) RESOLVED — all three shipped and
  closed. **SPEC-2** (M7-D recurring-never-deducts) RESOLVED — see the post-mortem above.
- **M6-TRIP** CLOSED — `reviews/M6-TRIP-review.md` · `runs/M6-TRIP-run-2026-06-19.md`.
- **M5 / M4 / M3 / M2 / M1** CLOSED — `reviews/{M3,M2,M1}-review.md` · `runs/{M5,M4,M3-retest,
  M2-S5-retest,M1-M2}-*.md`. Includes: `QA-M3-1` (deleted recurring occurrence recreated → `skipOccurrence`
  wired into `transactions-client.tsx`), `QA-M2-2` (K+ bare-name-before-PromptPay-mask positional
  pattern), `M2-5..M2-12` (EMVCo tag-62/05 ref_code, header-scan bank detection, `findTimeAfter`,
  decomposed sara-am `ํา`→`ำ` normalization), `M1-1..M1-4`. `M2-1` (≥9/10 accuracy) met at 10/12 corpus;
  `M2-2` (no image upload) and `M2-4` (soft-dedup) verified; `M2-3` (duplicate-QR rejection) was superseded
  by the `M2-7` dedup fix (per `pm-desk/projects/jodsa/progress.md`) and is now covered by the standing
  `tests/e2e/{m2-slip-import,m7-dup-override,trip-4-authz-dedup}.spec.ts` specs.
- **FIELD-1 / FIELD-2 / FIELD-3** CLOSED 2026-06-13 (post-MVP device-testing round) — mobile Save button
  behind the bottom nav (`pb-24 md:pb-6`, guarded by `tests/e2e/field-1-mobile-save.spec.ts`); counterparty
  pre-fill for KTB/TTB/Paotang layouts + the sender-as-counterparty correctness fix; bank-matched account
  auto-select. `runs/FIELD-{1-run,2-capture,2-retest,2-close}-2026-06-13.md`. Residual scope decisions →
  **Known limitations (slip parser)** above.

**`/invest` module (SPEC-4) — M0 · M1 · M3 · M5 done; M2 still open (see OPEN).**
- **QA-M5** GREEN 2026-07-17 — Plan tab, prod build + live Supabase, **9/9**, no app defects, no bug briefs
  filed. Order-independence real: `invest-m5` 10/10 twice; full `invest-*` suite 21/21 three times.
  `runs/QA-M5-invest-2026-07-17.md` (+ `runs/evidence/qa-m5-no-trade-2026-07-17.png`). NO-TRADE ruled a
  first-class outcome. Not covered, stated plainly: the **owner's real seeded portfolio** was not the
  fixture (an M0-*shaped* book was reconstructed as test user A), and fixtures use synthetic **FX 1.0**.
- **INVEST-M5** APPROVED (code+unit) 2026-07-16 — AI Monthly Buy/Sell Planner at `9b1a1c8`. M0 guardrail
  met **by omission** (repo-wide grep for VaR/CVaR/risk-contribution → zero); no-execution guard real and
  independently swept; NO-TRADE genuinely reachable; effective NVDA 27.36% inside M0's hand-derived 26–29%
  band. `reviews/INVEST-M5-review.md`. Residual forward notes → SPEC-4 above.
- **INVEST-M3** APPROVED 2026-07-15 — Portfolio Dashboard at `ac1b16c`; per-asset aggregation before
  concentration proven by a fixture that fails without the merge. `reviews/INVEST-M3-review.md`.
- **INVEST-M1** APPROVED 2026-07-14 — Holdings + Asset-Transaction Ledger; `0008` applied live, 2-user RLS
  proven. `reviews/INVEST-M1-review.md`.
- **QA-M1 + QA-M3** GREEN 2026-07-15 — prod-build E2E, live Supabase; 12/12 twice, order-independent; the
  blank-FX excluded-holding banner confirmed. `runs/QA-M1-M3-invest-2026-07-15.md`.
- **M0 gate** PASS 2026-07-16 (fin-desk, N=1 real portfolio) —
  `idea-forge/ideas/jodsa-investments/docs/M0-validation.md`. **Its guardrail is permanent and binds M5+:**
  load-bearing suggestions must rest on **concentration + drift** (robust to proxy), never on precise
  risk-contribution / VaR / CVaR math (directional + tagged only).
- **Fable build-readiness review** GO-WITH-NOTES 2026-07-14 — M1/M3/M5 notes spent; the durable ones were
  folded into **Repo gotchas** above.
- Migration applies: `0008` (2026-07-14) and `0009` (2026-07-16) both applied live by the orchestrator on
  owner authorization and independently verified (19/19 system assets classified, 0 `proxy_class` nulls).
  The stale classify-flow premise (`36e38d0`) is corrected — the owner's 3 custom assets **are** classified,
  so his first plan does **not** hit `blocked`.

**Regression sweeps.**
- **Standing sweep** GREEN 2026-07-14 — trip + M4 guest-pay + the new **anon-deny** DB-layer security
  spec, prod build, 23/23 twice. `runs/regression-sweep-2026-07-14.md`. `QA-M9-H1` resolved there
  (`m9-trip` hardened, 16/16 twice). `QA-M7-H1` stays open → see OPEN.
