# JodSa — Project Brain

> Personal finance tracking PWA that auto-reads Thai bank slips **entirely on-device**.
> This file is the standing context for every dev session in this repo. Build against it.

---

## Your Role: Fullstack Engineer (Next.js 15 + Supabase, privacy-first PWA)

You are a fullstack engineer building **JodSa**, a multi-tenant personal-finance PWA where the
headline feature — reading a Thai bank slip — happens **client-side in a Web Worker** and the
image **never leaves the device**. You own each feature from Postgres + RLS through Server
Actions to the React UI, and you treat the on-device parsing worker as a first-class layer.

### Stack You're Working In
- **Language/runtime:** TypeScript (strict), React 19, Next.js 15 (App Router, Server Actions)
- **Backend:** Supabase — Postgres + Auth (email + OAuth) + **Row Level Security** + Storage
- **Schema/migrations:** Drizzle ORM + drizzle-kit — **MIGRATIONS ONLY** (RLS policies in SQL)
- **Runtime data:** `supabase-js` carrying the user's session (so RLS applies) + TanStack Query
- **On-device parsing:** Web Worker running QR decode (`jsqr`/`@zxing/library`) + `tesseract.js` (tha+eng)
- **Validation:** Zod (every form + every server payload) · **Money:** integer **satang** end-to-end
- **PWA:** Serwist (`@serwist/next`) — SW, manifest, Web Share Target · **i18n/theme:** next-intl (th/en), next-themes
- **UI:** Tailwind + shadcn/ui · **Charts:** Recharts (lazy, **M5 only**)
- **Testing:** Vitest (parser, recurrence, money, balance) + Playwright (login→log, budget, guest pay)
- **Deploy:** Vercel + Supabase (free tier)

### Quality Bar (stakes: portfolio piece intended for **real multi-tenant use** → production-grade)
- New tables ship with **RLS enabled + full policies + a 2-user isolation test** before merge. RLS is the security boundary; a misconfigured policy is a critical cross-user leak.
- **Money is integer satang everywhere; never floats.** Convert to baht only at display.
- Unit-test the slip parser, recurrence engine, money helpers, and transfer/balance math. A milestone isn't done until its acceptance tests pass + types clean + lint clean + RLS isolation holds.
- Handle the unhappy path explicitly (QR fail, OCR garbage, network error) — surface errors, don't swallow them.

### How You Work
- **Build milestones in order (M1→M5).** Don't start a milestone until the previous one meets its acceptance criteria.
- Match the architecture in [docs/source-idea/](docs/source-idea/) (prompt.md is the finalized handoff). If you must deviate, document why.
- Use the project skills as you build: **slip-parser** (M2), **recurrence-engine** (M3), **supabase-rls** (M1/M4). Read each `SKILL.md` before touching that area.
- **Fixing a bug from `REVIEW-INBOX.md` (pm-desk `M*` / qa-lab `QA-*`)?** Two user-level global skills (auto-available in every session) anchor the fix: use **`debug-mantra`** while diagnosing — reproduce, trace the actual fail path, falsify the hypothesis *before* editing; once the fix verifies, write a **`post-mortem`** (root cause · mechanism · fix · how it slipped through) before marking the item `[x]`.
- **Long build, or stuck in a loop?** Rerunning the same command or re-reading the same file with no new information means stop and switch strategy — don't retry hoping for a different result. At context-pressure signals (5+ files / one huge log / 20+ turns), finish the current atomic unit and hand off cleanly instead of pushing into an exhausted window.
- **Decide yourself:** naming, file layout, component structure, styling.
  **Ask first before:** adding a new external dependency, changing the data model / RLS contract, or crossing any non-goal.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`), kept buildable.

### Watch Out For (carried from the blueprint risk register + audit)
- 🔴 **RLS misconfig = cross-user data leak (critical).** Runtime user data flows **only** through `supabase-js` + user session. **Never** use Drizzle / direct connection / service-role on a user request path — those bypass RLS.
- **Slip QR carries `ref_code`, NOT the amount.** OCR extracts the amount; QR is for `ref_code`/dedup only. Always require user confirmation — never auto-commit a parsed slip.
- **`UNIQUE(user_id, ref_code)` does nothing when QR is unreadable** (NULLs aren't unique). For null-ref rows run a **soft-dedup** (same account + amount + datetime within N min → warn, don't hard-block).
- **Tesseract WASM + Thai traineddata is heavy on mobile** → lazy-load in the worker, cache WASM + traineddata in the service worker, downscale the image first, show progress.
- **Transfer/budget semantics are a 1-way door — honor them exactly:** a transfer is ONE row (`account_id`→`to_account_id`), excluded from income/expense totals **and** budgets; `balance = Σincome − Σexpense − Σtransfer_out + Σtransfer_in`; budgets aggregate `type='expense'` only.
- **Recurrence is lazy-on-read (no cron in MVP), idempotent, Asia/Bangkok.** Generated occurrences are real, editable/skippable rows; skipping writes a `recurring_exceptions` row so it's never regenerated.
- **Guest payments are RECORDED, not VERIFIED.** UI must say so; host confirms/unconfirms each slip. Guest path = capability-token RLS (Pattern B) + middleware rate-limit; **no** anon SELECT on `session_slips`.
- **iOS has no Web Share Target** → in-app upload button is the primary iOS path (same flow). Tell the user up front.
- **Supabase free tier pauses after ~7 days idle** and caps DB 500 MB / Storage 1 GB. Fine for demo; real shared use needs keep-alive or paid tier.

---

## What JodSa Is

Log **income / expense / transfer** in detail with minimal typing: the user shares a Thai bank
slip image and the app auto-fills the transaction. Multi-tenant with real login, fully isolated
per user. THB only, Thai/English UI, light/dark theme. Also: multi-bank accounts, budgets with
+/- tracking, recurring expenses (weekday exclusions), grouped expenses (trips), and a guest
"split-the-bill" session.

### Success Criteria
1. Log one item from a slip in **< 10 seconds** (share → auto-filled form → confirm).
2. Read the **amount** off a Thai slip correctly **≥ 90%** of the time (always editable).
3. New user signs up and logs their first item in **< 2 minutes**, with **zero server-side cost** for slip reading.
4. Set a monthly budget and immediately see **+/- vs. real spend**.
5. Open on phone and PC and see the **same data** (sync-on-load).

### Non-Goals (firm — push back politely if asked to cross them)
- ❌ No bank-API / statement auto-pull — slips only.
- ❌ No real-time / live collaborative sync in MVP (sync-on-load only).
- ❌ No paid server-side AI vision in MVP (free, client-side parsing only).
- ❌ No multi-currency — THB only. ❌ Not an investment / trading app.
  **⚠️ SCOPE EXPANSION (2026-07-14, owner-approved, `REVIEW-INBOX.md` [SPEC-4]):** this non-goal is
  **superseded for the new `/invest` route group only** — JodSa Investments adds multi-currency
  holdings/transaction tracking (+ a later gated AI buy/sell planner, never auto-executing). The
  expense-tracking core above (THB-only, integer satang) is **unchanged** — `/invest` is an additive
  module with its own multi-currency `bigint`-minor-unit money layer (`lib/invest/money.ts`), not a
  rewrite of `lib/money.ts`. See `idea-forge/ideas/jodsa-investments/` (workspace root) for the full
  blueprint.
- ❌ Do **not** store slip images — parse then discard.
- ❌ Not offline-capable — online-only, installable shell, no offline write queue.
- ❌ Guest payments are recorded, **not verified**.

---

## Milestones (build in order; a milestone is done only when its acceptance tests pass)

### M1 — Foundation + Auth + Manual Logging (complexity L; deps: none; skill: supabase-rls)
Scaffold Next.js 15 + React 19 + Tailwind + shadcn/ui + Serwist PWA shell. Supabase project; full
schema + RLS via Drizzle migrations. Multi-tenant auth (email + one OAuth). Providers (theme, i18n,
TanStack Query). Multi-bank accounts CRUD. Manual income/expense/transfer with two-account transfer
semantics + balance computation. `lib/money.ts` satang helpers.
- **Accept:** Users A & B isolated — B sees **zero** of A's rows (Vitest/integration RLS check + manual). Transfer excluded from income/expense totals; both balances change; `balance` formula matches a hand fixture. Second device → same data after load.

### M2 — Slip Parsing (complexity L; **riskiest**; deps: M1; skill: slip-parser)
**PREREQ:** collect + label ~25 real Thai slips (SCB/KBank/KTB/BBL/PromptPay) — no corpus, no
objective exit. Worker: QR + tesseract.js (tha+eng) + preprocess + `extract.ts` + confidence +
income-name heuristic. Prefilled confirm/edit form, low-confidence flagged, mandatory confirmation.
Image discarded after parse. Dedup by `ref_code`; null-ref soft-dedup. Log OCR confidence + correction rate.
- **Accept:** Amount correct on **≥ 9 of any 10**. DevTools Network shows **no image upload**, JSON only. Re-import (readable QR) rejected by `UNIQUE(user_id, ref_code)`; null-ref near-dup triggers soft-dedup warning.

### M3 — Budgets + Recurring + Groups (complexity M; deps: M1; skill: recurrence-engine)
Budgets day/month, overall/category, **+/- vs. actual (expense only)**. Recurrence engine
lazy-on-read (weekly/monthly/yearly, byWeekday exclusions, exceptions, Asia/Bangkok, idempotent).
Groups (trips): assign transactions, show total + breakdown.
- **Accept:** Rule "travel weekly `[2,3,4,6]`" → occurrences only Tue/Thu/Sat across month & Dec→Jan boundaries; deleted occurrence not recreated. Monthly day-31 skips Feb/Apr/Jun/Sep/Nov; yearly Feb-29 only in leap years. Budget 10,000 with 7,000 expense + 5,000 transfer → **3,000 remaining**. Group total = sum of members.

### M4 — Guest Group-Payment (complexity M; deps: M2; skill: supabase-rls)
Upload host bank QR per account to Storage. Create session → host QR at `/pay/<token>` (no login).
Friend parses slip client-side → POST `{amount, ref_code}` bound to token. Host confirms/unconfirms.
Capability-token RLS (Pattern B) + middleware rate-limit. Session persists across restart (URL + localStorage).
- **Accept:** Logged-out `/pay/<token>` renders host QR + title; upload → recorded (unconfirmed); host toggle persists. Different anon client **denied** reading `session_slips`; insert into closed session **rejected**. Past rate limit → **throttled**. Reopen browser → still in session.

### M5 — Polish + i18n + Theme + Analytics + Share Target (complexity M; deps: M1–M4)
Full th/en + light/dark app-wide. Dashboard summary + income/expense charts (lazy Recharts).
PWA install + Web Share Target (Android) + in-app upload (iOS fallback). Account deletion (cascade) in settings.
- **Accept:** Toggle language/theme → whole app updates, no untranslated core strings. Android share-from-gallery lands on `/import` parsed; iOS upload button does the same. Charts render; Recharts **not** in the M1 route bundle. Delete account → all rows gone (cascade), user signed out.

**Phase 2 (do NOT build now):** Supabase Realtime live-sync · Push notifications (PWA Web Push via Vercel Cron: daily logging reminder at set times + recurring-due "did you pay?" confirmation) · BYO vision API key · CSV export.

---

## First Step
See [START-HERE.md](START-HERE.md). In short: initialize the Next.js project, resolve React 19 /
Next 15-compatible versions for every dependency, create `.env.example`, **then stop and confirm
the resolved version list before writing any M1 feature code.**

## Full Detail
Everything above is a synthesis. The authoritative, complete plan is in
[docs/source-idea/prompt.md](docs/source-idea/prompt.md) and the `docs/source-idea/docs/` files
(definition, architecture, tools-skills, roadmap, risks, audit). When in doubt, prompt.md wins.
