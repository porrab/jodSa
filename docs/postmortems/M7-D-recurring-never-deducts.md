# Post-mortem: recurring rules set but never deducting (M7-D)

**Source**: `REVIEW-INBOX.md` SPEC-2 (idea-forge, 2026-07-10), first reported by the owner
2026-07-02 in `PERF-HANDOFF.md` §"Related correctness bug", still failing in the field after
the perf pass. **Fix commit**: see `git log` for the `fix(recurrence): ...` commit immediately
following this file's addition in the same session. **Owner**: dev session (jodsa).

## Summary

Recurring rules materialized inconsistently or not at all because the lazy-on-read guard in
`lib/recurrence/range.ts` silently no-opped on any row shape drift, `lib/recurrence/materialize.ts`
ran every stale rule's insert as one all-or-nothing batch so a single bad rule could mask progress
on every other rule, and materialization generated the *whole current month* up front instead of
stopping at today. Fixed by hardening the guard to treat any falsy value as "never materialized",
isolating each rule's insert/guard-update, and clamping the materialization window to today
(Asia/Bangkok). Also added user-visible status (last-deducted / next-due / error) on the recurring
page and a 🔁 badge on materialized rows, per design J7.

## Symptom

Field report: "ตั้งรายการประจำแล้วแต่ไม่ได้หักจริงเลย" (set up a recurring rule but it never
actually deducts). No error surfaced to the user — `materializeOccurrences` failed silently when
it failed at all, and the `/recurring` page never called it, so a user who only visited that page
had no way to see whether anything had run.

## Root cause

Three independent defects in `lib/recurrence/`:

1. **`needsMaterialization` false negative on shape drift** — `range.ts`:
   ```ts
   export function needsMaterialization(materializedThrough: string | null, to: string): boolean {
     return materializedThrough === null || materializedThrough < to
   }
   ```
   If `materializedThrough` ever arrives as `undefined` instead of `null` (a partial select, a
   stale generated-types shape, or any other drift), `undefined === null` is `false` and
   `undefined < to` is also `false` (relational comparison against `undefined` is never true) — the
   function returns `false`, meaning "already materialized," permanently. The rule is silently
   skipped on every future load with no error and no log line.

2. **All-or-nothing batch across rules** — `materialize.ts` built one `toInsert[]` array spanning
   *every* stale rule, called `supabase.from('transactions').insert(toInsert)` once, and then
   advanced `materialized_through` for *every* stale rule's id in one `.in(staleIds)` update — with
   the update's own error unchecked. A single poisoned rule (bad account reference, a constraint
   violation, an RLS edge case) failed the one shared insert call, and because the guard update ran
   regardless of whether the insert had errored, the code could advance a rule's guard even though
   its row was never actually written — or, depending on ordering, leave every other rule's
   otherwise-healthy insert unattempted for that load.

3. **No due-date clamp** — `app/(app)/dashboard/page.tsx` and `app/(app)/transactions/page.tsx`
   call `materializeOccurrences(from, to)` with `to` = `currentMonthRange().to` (the *last day of
   the month*), and `materialize.ts` passed that straight through to
   `generateOccurrenceDates(rule, from, to, exceptions)` with no clamp. When it worked, a due-today
   rule's whole remaining month of occurrences materialized in one shot — money looked spent weeks
   before the actual due date, contradicting the product's due-date mental model (design J7).

## Why it produced the symptom

Defect 1 explains the *total* silence some users hit: once a rule's `materialized_through` ever
became `undefined` for any reason, `needsMaterialization` returned `false` forever, and the rule
was filtered out of the `stale` array before any insert was even attempted — nothing to log,
nothing to fail, just permanent silence. Defect 2 explains the *intermittent* cases: a user with
several rules where one had gone bad (e.g. its `account_id` was deleted) would see none of their
rules deduct on that load, because the shared insert failed as a unit. Defect 3 is a separate,
non-silent but still-wrong behavior: rather than "never deducts," the rule deducts *too early* —
both symptoms were reported under the same field complaint umbrella.

## Fix

- `lib/recurrence/range.ts`: `needsMaterialization` now returns `!materializedThrough || materializedThrough < to` — any falsy value (`null`, `undefined`, `''`) is treated as "never materialized," never silently skipped. Added `todayBangkok()` and `clampToToday(to)`.
- `lib/recurrence/materialize.ts`: replaced the single batched insert + single batched guard update with a per-rule loop. Each rule's `toInsert` is built and inserted independently; on insert failure the rule's guard is **not** advanced (so the next load retries just that rule) and the error is captured in a new `RuleMaterializeResult { ruleId, ok, error }` array returned alongside `inserted`. The guard update's own error is now checked and reported per rule too — previously unchecked. `effectiveTo = clampToToday(to)` is computed once at the top and used for the stale filter, `generateOccurrenceDates`, the existing-occurrence range query, and the guard value — so a rule is never materialized, nor its guard advanced, past today regardless of what month-end `to` the caller passes.
- `app/(app)/recurring/page.tsx` + `components/recurring-form.tsx`: the recurring page now also calls `materializeOccurrences` (previously only `/dashboard` and `/transactions` did), computes each rule's last-deducted date (max `occurrence_date` across all its materialized transactions) and next-due date (`lib/recurrence/status.ts` `computeNextDue`, a pure function bounded to a 2-year horizon), and renders "หักล่าสุด / ครั้งถัดไป" or an explicit error line per rule (design J7). `app/(app)/transactions/transactions-client.tsx` adds a 🔁 badge on rows with a `recurring_rule_id`.

This fixes the mechanism directly rather than papering over the symptom — no prior fix attempt
existed for this bug; the perf pass (`PERF-HANDOFF.md`, commits `2917b7d`/`e0447d8`) added the
`materialized_through` column and wired the guard call for the first time, but never exercised a
per-rule-failure or shape-drift scenario, so these three defects shipped with that pass.

## How it was found

The SPEC-2 brief (idea-forge, `REVIEW-INBOX.md`) had already narrowed this to code inspection
before this session started — it named all three defects directly from reading
`lib/recurrence/range.ts` and `materialize.ts`, and established that migration `0006` (which adds
`materialized_through`) is applied on the live Supabase (a REST probe of
`recurring_rules?select=materialized_through` and `rpc/account_balances` both returned 200, ruling
out the unapplied-migration hypothesis). This session verified each defect by direct code reading
(matching the brief) rather than re-deriving them from scratch, then wrote unit tests against the
*actual* fixed code to confirm the mechanism: `tests/unit/recurrence.test.ts` for the guard, and a
new `tests/unit/materialize.test.ts` (mocking `@/lib/supabase/server` with a minimal chainable
fake, since `materialize.ts` is server-only) for the per-rule isolation and today-clamp — both
passed only after the fix.

## Why it slipped through

Latent code introduced by the perf pass. `materialized_through` and the `needsMaterialization`
guard were both added in that pass specifically to *stop* redundant materialization work, not to
change correctness — so the pass's own testing focused on "does this no-op when nothing changed,"
not "what happens when one of several rules is bad" or "what if the column comes back as
`undefined`." No test exercised a multi-rule batch with one failing rule, and no test asserted a
clamp to today because the clamp didn't exist yet — the whole-month-up-front behavior was
long-standing from M3 and only became wrong once design J7 defined the due-date mental model as a
requirement.

## Validation

- `tests/unit/recurrence.test.ts`: `needsMaterialization(undefined, '2026-07-31')` → `true` (was `false` before the fix); `clampToToday`/`todayBangkok` new tests pass.
- `tests/unit/materialize.test.ts` (new, 3 tests): one poisoned rule's insert failure does not block another rule's insert or guard-advance; a guard-update failure is reported per-rule; a weekly rule due multiple times in a 30-day window only materializes through today (one row, not four or five) and the guard advances to today, not the caller's far-future `to`.
- Full unit suite: `180 passed` (`pnpm dlx dotenv-cli -e .env.test -- pnpm vitest run tests/unit`), including the live-Supabase RLS suite (`tests/unit/rls.test.ts`, 13/13, not skipped — `.env.test` credentials are present and Supabase is reachable, not paused).
- `pnpm exec tsc --noEmit` → exit 0. `pnpm build` → succeeds (19/19 static pages, all dynamic routes compile).
- `tests/e2e/m3-recurring.spec.ts` re-run live against `pnpm dev` + the real Supabase project → **passes** (creates a weekly rule, confirms ≥1 occurrence materializes this month under the new today-clamp, deletes one via the new detail-sheet UI, reloads, confirms it is not recreated).
- Not validated: the field reporter's *specific* rules/data (no access to their account) — the fix addresses every code-level mechanism the brief confirmed, but the original reporter's exact repro was never reproduced 1:1 against their live data, only against synthetic rules built for the new tests and the E2E spec's own rule.

## Action items / follow-ups

- None beyond the two new regression tests already landed (`tests/unit/materialize.test.ts`,
  `tests/unit/recurrence.test.ts` additions) — no further class-of-bug follow-up identified.
- Pre-existing, unrelated known limitation not touched by this fix: materialization only back-fills
  the *current* month's window (`currentMonthRange()`); a month the app was never opened during
  still never gets its occurrences back-filled. Documented in `PERF-HANDOFF.md` as a known
  limitation, out of scope for M7-D per the roadmap.
