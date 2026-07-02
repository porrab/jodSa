<!-- HANDOFF -->
> **HANDOFF — Page-load performance** · for a **JodSa dev session** · 2026-07-02
> **You are here:** `project/jodsa/PERF-HANDOFF.md` (repo root of the build)
> **Start:** read this file, then `CLAUDE.md` (project brain). Self-contained — no prior chat needed.
> **Scope:** make first-visit page loads faster. Do **not** redo the already-shipped nav-cache work (below).

---

## Goal

Cut the **first-visit** server work per page (dominated by the dashboard). Navigation *between already-visited*
pages is already instant — the remaining lag is the fresh Supabase round-trip on first load, worst on `/dashboard`.

## What's already shipped (do NOT redo)

Committed in `perf(nav): client router cache + revalidate /budgets on mutations` and the `feat(design)` motion pass:

- **Client router cache** re-enabled: `next.config.ts` → `experimental.staleTimes { dynamic: 30, static: 180 }`.
  Next 15 defaults `dynamic` to 0, which made every revisit refetch. This fixed revisit latency.
- **`.page-enter`** fade-up transition (`app/(app)/template.tsx` + `app/globals.css`) — keeps nav feeling continuous.
- Mutations call `revalidatePath` (incl. `/budgets`) so writes stay fresh under the cache.

So: **revisits are fast. This task is only about the first server render of a page.**

## Root cause (established)

Every page under `app/(app)/` is a **dynamic** server component (reads `cookies()` via the Supabase server
client → forced dynamic rendering). Next's prefetch can only prefetch up to `loading.tsx`, **not the page data**,
so first navigation always pays a full server round-trip to Supabase. Free-tier Supabase adds network latency +
possible cold-start. The lever is **reducing/bounding the per-page Supabase work**, not caching.

## Hotspots (measure before changing — see below)

**`app/(app)/dashboard/page.tsx`** — the heaviest page, ~6 queries:
1. **`await materializeOccurrences(matFrom, matTo)` (line ~40) blocks the render** — it runs a *write-on-read*
   (recurring lazy-materialization) and is `await`ed **before** the transaction reads (lines ~44–58), serializing
   the whole page behind it. It fires ~3 queries (rules, exceptions, existing rows) on **every** dashboard load even
   when nothing is due. See `lib/recurrence/materialize.ts`.
2. **`allTx` (line ~48): `select('type, amount_satang, account_id, to_account_id')` with NO limit** — pulls **every
   transaction the user has** to compute balances in JS (`computeAccountBalance`, used lines ~85 and ~146). This
   grows unbounded over time → the dashboard gets slower the more the user logs.

**`app/(app)/transactions/page.tsx`** (line ~15) also `await materializeOccurrences(...)` before listing.

## The task — levers, ranked (each with its guardrail)

1. **Stop materialize from blocking / running every load.** It's correctness-sensitive.
   **READ `.claude/skills/recurrence-engine/SKILL.md` first.** Options to weigh: run it in only ONE place per
   window instead of on both dashboard + transactions; add a cheap "already materialized through <date>" guard so it
   no-ops when the visible window hasn't advanced; or move it so it doesn't serialize in front of the reads.
   **Must preserve:** lazy-on-read semantics, idempotency, Asia/Bangkok dates, and all `recurrence` unit tests.
2. **Bound the balance computation.** Replace the unbounded `allTx` pull with a **Postgres aggregate/RPC** (sum
   grouped by account, honoring transfer in/out) or maintained running balances, so cost doesn't scale with total
   tx count. **Must preserve:** integer **satang** everywhere; `balance = opening_balance_satang + Σincome −
   Σexpense − Σtransfer_out + Σtransfer_in` (note the new `accounts.opening_balance_satang` column, added 2026-07-02);
   `money.test.ts` must stay green. If you add an RPC, it runs under the **user session** (RLS applies) — never
   service-role on a request path.
3. **Collapse round-trips.** Consider a single dashboard-summary RPC (totals + this-month income/expense + budget
   status) so one round-trip replaces ~6. Keep it RLS-safe.
4. **Per-route `loading.tsx`** with skeletons matching each page (perceived speed). Currently only one group-level
   `app/(app)/loading.tsx` exists. Cheap, low-risk.
5. **Optional:** use TanStack Query (already in the stack, unused for page data) to cache list data client-side for
   frequently-revisited lists; tune `staleTimes` if needed.

## Hard constraints (from CLAUDE.md — do not violate)

- **RLS:** runtime user data flows **only** through `supabase-js` + user session. Never Drizzle/direct-connection/
  service-role on a request path. (A direct-postgres call was used once for a DDL migration — that is NOT a runtime path.)
- **Money:** integer satang; convert to baht only at display.
- **Transfer semantics are a 1-way door:** one row (`account_id`→`to_account_id`), excluded from income/expense
  **and** budgets; budgets aggregate `type='expense'` only.
- **Recurrence:** lazy-on-read, idempotent, Asia/Bangkok. Read its SKILL before touching.
- Don't regress the shipped `staleTimes` / `.page-enter` / revalidatePath behavior.

## Measure first (debug-mantra)

Don't optimize blind. Instrument the dashboard server component with timing around each query group (e.g.
`console.time`), run a **prod build** (`pnpm build && pnpm start` — dev mode's on-demand compile is not
representative), warm Supabase first (free tier cold-starts / **pauses after ~7d idle → host NXDOMAIN**; restore in
the dashboard before testing), and confirm which query actually dominates before changing it.

## Definition of done

- Dashboard first-load: materialize no longer serialized-on-every-load; balance query bounded (cost independent of
  total tx count); round-trips reduced where sensible.
- Before/after timing captured on a prod build.
- Green: `pnpm exec tsc --noEmit`, `pnpm build` (lint+types), `pnpm test` (114 unit tests incl. money/recurrence/budget).
- No correctness regression in balance / recurrence / budget math.
- Conventional Commit(s), buildable. If you add a DB object (RPC/index), add a hand-authored SQL migration under
  `db/migrations/` (this project applies migrations by hand — the drizzle snapshot/journal is NOT clean, so
  `drizzle-kit generate` emits full CREATE TABLE; do not use it).

## Key files
- `app/(app)/dashboard/page.tsx` · `app/(app)/transactions/page.tsx`
- `lib/recurrence/materialize.ts` · `.claude/skills/recurrence-engine/SKILL.md`
- `lib/money.ts` (`computeAccountBalance`) · `tests/unit/money.test.ts`
- `next.config.ts` (staleTimes) · `app/(app)/template.tsx` · `app/(app)/loading.tsx`
