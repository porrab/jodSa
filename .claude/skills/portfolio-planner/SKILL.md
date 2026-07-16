---
name: portfolio-planner
description: Use when implementing or modifying the monthly buy/sell planning math — allocation-drift vs a user target, concentration, ETF look-through, stress scenarios, new-money allocation, epistemic tags, NO-TRADE verdict. Pure, deterministic TypeScript over resolved holdings + a versioned proxy-parameter dataset + the owner's new-money cadence. Do NOT use for live pricing, correlation-matrix / rebalancing-engine / reverse-stress (Phase 2), a market-data API call (none in MVP), or anything that places or simulates a real order (there is no execution path).
---

# Portfolio Planner (M5 — decision-support only)

> **Built 2026-07-16.** M0 recorded PASS (`idea-forge/ideas/jodsa-investments/docs/M0-validation.md`,
> real N=1 portfolio, effective NVDA ~27% via S&P look-through double-counting — a genuinely
> decision-useful, non-obvious finding) and M3 was already done, so M5 was implemented per this file's
> pipeline. Persistence needs migration `db/migrations/0009_invest_plans.sql` (the `plans` table +
> an `assets.proxy_class` backfill) — **author + verified locally only, not yet applied to live
> Supabase** (owner sign-off pending, same guardrail as `0008`).

Turns **resolved holdings + versioned proxy params + the owner's new-money cadence (~3k THB/mo)** into
**buy / sell / hold / rebalance suggestions, each with a one-line rationale** — or a first-class
NO-TRADE. Pure functions: same inputs + same `param_version` ⇒ identical `Plan`. **It never places or
simulates a real order; its output type is a recommendation with no execute sink.**

## Canonical discipline — reuse, do not reinvent
The methodology lives at `Resources/portfolio-risk-review/portfolio-risk-methodology.md` (relative to
workspace root `E:\claudeWorkSpace` — **note the corrected prefix**: the prompt.md handoff says
`fin-desk/Resources/...`, but that path does not exist; the canonical file is at the workspace-root
`Resources/` directory, per the SPEC-4 Fable build-readiness review). Reuse its discipline applied to
buy/sell planning. Do NOT paraphrase or shortcut it.

## Non-negotiable discipline (from fin-desk)
- **Capital-weight ≠ risk-weight** — surface it; MVP risk view is *standalone vol-weighted*, not
  correlation-adjusted (correlation is Phase 2).
- **No false precision** — range-in → range-out; tag every estimate; if two options differ by less than
  estimation error, say so.
- **ETF look-through** — best-effort from `assets.lookthrough`; ETFs with no/stale data are flagged
  "opaque — treat as concentrated".
- **NO-TRADE is a valid output** — never manufacture a finding.
- **Risk-capital separation** — a `risk_capital`-sleeve holding (overlapping the trading-bot capital) is
  100%-losable and flagged; never suggested as "investing".
- **Decision-support, not licensed advice** — always render the disclaimer + "you place any trade".

## Pipeline (`lib/invest/planner/`)
0. `resolve.ts` — assert every holding is classified (`asset_class` + `proxy_class`); an unclassified
   holding BLOCKS the plan with a "classify this holding" prompt. (Usually already resolved from M1 —
   see `lib/validators/invest.ts` and the `assets`/`holdings` RLS-scoped tables from M1.)
1. `allocation.ts` — current allocation by asset_class/sleeve/currency + **drift vs the user's target
   allocation** (the plan snapshots the target it used).
2. `concentration.ts` — top-N positions, top sector, HHI; best-effort ETF look-through.
3. `stress.ts` — 1–2 scenario shocks (e.g. "equity −20% / gold +5%", "USD/THB −10%", "crypto −40%")
   from `proxy-params.stress_factors`; estimated impact as a tagged range.
4. `plan.ts` — combine drift + concentration + stress + the new-money cadence into buy/sell/hold/
   rebalance suggestions with a one-line rationale each; prefer using new money to reduce drift before
   proposing sells.
5. `tags.ts` — attach `[JUDG-PROXY]`/`[APPROX]` + as-of basis + `param_version` to every estimate.
6. `verdict.ts` — emit **NO-TRADE / "portfolio is fine"** when within sensible bounds; else list
   suggestions. Never fabricate. Always render the disclaimer.

## Proxy-param contract
`proxy-params.json` is app-shipped + versioned (`param_version`). Each `proxy_class` row: `annual_vol`,
`stress_factors` (per scenario). Covers ALL MVP classes incl. `thai_set` and a high-vol `crypto`. Every
`Plan` pins the `param_version` it used (reproducibility). A holding whose `proxy_class` is missing is
flagged, never defaulted silently.

## Plan schema
`{ createdAt, paramVersion, displayCurrency, newMoney: {minor, currency}, targetAllocation, totalValueMinor, riskCapitalPct, allocationDrift, concentration: {direct, effective, opaqueVehicles, anyConcentrated}, stress[], suggestions: {action, assetClass, assetId?, amountRange?, rationale, reasonKey, reasonParams, tags}[], verdict, headline, headlineKey, headlineParams, disclaimer }` (see `lib/invest/planner/types.ts`) — persisted to `plans` (`db/migrations/0009_invest_plans.sql`, Pattern A owner RLS, select/insert/delete only — a plan is immutable). `reasonKey`/`reasonParams` are separate from the canonical English `rationale` string so the UI can render th/en via next-intl while the persisted/tested text stays a fixed, hand-fixture-matchable string.

## When NOT to use
- Live/real-time pricing (no feed in MVP).
- Full correlation/crisis-correlation matrix, position-sizing, rebalancing engine, reverse-stress — Phase 2.
- ANY order execution / broker integration / trade simulation — permanently out of scope. Enforced by
  `tests/unit/invest/planner/no-execution-guard.test.ts` (greps the planner surface for
  execution-shaped identifiers — `placeOrder(`, `executeTrade(`, `brokerApi`, etc. — asserts zero).

## Files (built 2026-07-16)
`resolve.ts`, `allocation.ts`, `concentration.ts`, `stress.ts`, `plan.ts`, `tags.ts`, `verdict.ts`,
`proxy-params.json`, `types.ts`. Hand-computed fixtures live in
`tests/unit/invest/planner/plan.test.ts` (not a separate `test-cases.md` — kept next to the code they
verify, matching this repo's existing `tests/unit/invest/*.test.ts` convention).

## Dependencies — deviation from the original blueprint
**`decimal.js` was NOT added.** The blueprint called for it for "ratio math," but every other module in
`lib/invest/` (`money.ts`, `portfolio.ts`) already does ratio/percentage math with plain `number` +
explicit rounding points and documents *why* `decimal.js` is unnecessary for this app's scale — M5
follows the same precedent (percentages, proxy volatilities, and look-through weights are all already
approximate/proxy inputs, so `decimal.js`'s extra precision buys nothing real). This is judged a
non-issue under the project's "ask before a new external dependency" rule (no new dependency was
needed, so there was nothing to ask about) — documented here for the record in case a future session
expects `decimal.js` per the original blueprint text.

Reads the app-shipped proxy-params + the tracker's resolved holdings (`assets`/`holdings`/
`asset_transactions` from M1, via `lib/invest/portfolio.ts`'s `valueHolding()` for FX-converted display-
currency amounts). References the fin-desk methodology file above.
