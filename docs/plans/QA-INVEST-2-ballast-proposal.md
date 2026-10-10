<!-- HANDOFF -->
> **HANDOFF** — all paths below are relative to workspace root `E:\claudeWorkSpace`
> **For:** owner decision, then idea-forge specification and dev implementation
> **From:** idea-forge · 2026-10-10
> **You are here:** `project/jodsa/docs/plans/QA-INVEST-2-ballast-proposal.md`
> **Start here:** read this file top-to-bottom, then the QA-INVEST-2 brief in `project/jodsa/REVIEW-INBOX.md`.

# QA-INVEST-2: add an explicit ballast sleeve

**Status: APPROVED FOR IMPLEMENTATION — owner approval recorded 2026-10-10.** Add `ballast` as a fourth holding sleeve, expose it in the existing create/edit and allocation views, and let the owner explicitly reclassify holdings. Approval covers the key/copy, reporting-only scope, manual reclassification and unchanged planner behavior below. Canonical amendment: `idea-forge/ideas/jodsa-investments/docs/02-architecture.md` ("Ballast sleeve") and README Changelog 2026-10-10. This is not authorization to apply a live migration and is not an implementation or QA completion claim.

Evidence baseline: `project/jodsa` commit `5a74ed7`, inspected 2026-10-10. No production database or owner portfolio was inspected. Historical weights and the SGOV misclassification are the owner's report in QA-INVEST-2, not reverified current balances.

## 1. Definition and scope

The job is to distinguish holdings assigned a stabilizing portfolio role from core and satellite holdings. The user chooses this role per holding; it is not a risk rating, asset-class inference, return promise, or instruction to purchase a security.

Success means: a holding can persist `ballast`; it appears separately in sleeve allocation; reclassifying an existing holding changes no transaction, quantity, valuation, cost basis, or total; and tenant isolation remains intact.

Explicitly out of scope: sleeve target percentages, sleeve-based planner drift or recommendations, changes to asset/proxy classification, automated symbol-based reclassification, batch backfill UI, renaming existing sleeves, new investment products, OCR/corpus work, new tables, dependencies, external services, and changes to expense tracking.

### Correct the brief's premises before implementation

| Brief premise | Evidence in the current implementation | Consequence |
|---|---|---|
| The field is `risk_group` | `project/jodsa/db/schema.ts:171` defines `holdings.sleeve`; `project/jodsa/db/migrations/0008_invest_holdings.sql:48` creates a text column with a CHECK constraint. | Extend `sleeve`; do not create or rename a `risk_group` column and do not use PostgreSQL `ALTER TYPE`. |
| The planner computes sleeve drift | `project/jodsa/lib/invest/planner/allocation.ts` explicitly groups by `assetClass`; `project/jodsa/lib/validators/invest.ts` validates target allocation against `ASSET_CLASSES`. | Adding ballast fixes sleeve reporting, not the lack of sleeve targets. An ETF core/ballast split still belongs to the same `etf` planner target. |
| Changing core to ballast necessarily changes investment suggestions | `project/jodsa/lib/invest/planner/plan.ts` computes risk-capital percentage from `sleeve === 'risk_capital'`; drift uses asset class, concentration uses positions, and stress uses proxy classes. | With all other inputs equal, changing only core to ballast must preserve allocation drift, concentration, stress, and suggestions. This is an explicit regression test. |
| Allocation needs a new calculation model | `project/jodsa/lib/invest/portfolio.ts:212` groups sleeve allocation by the row's sleeve key; snapshot serialization already stores sleeve buckets. | Reuse the existing aggregation and denominator; extend the accepted values and display labels. |

## 2. Approved product decision (2026-10-10)

Use the stable key **`ballast`**. It describes the owner's intended role without claiming that every holding selected into it is inherently defensive or risk-free.

| Surface | Thai copy | English copy |
|---|---|---|
| New option / badge / chart label | ตัวถ่วง (Ballast) | Ballast |
| Field label (`invest.sleeveLabel`) | บทบาทในพอร์ต | Portfolio role |
| Allocation heading (`invest.allocationBySleeve`) | แบ่งตามบทบาทในพอร์ต | By portfolio role |
| Ballast-only helper in create/edit form | ส่วนที่คุณกำหนดให้ช่วยถ่วงความผันผวนของพอร์ต ไม่ได้หมายความว่าไม่มีความเสี่ยง | The part you assign to help stabilize the portfolio; this does not mean it is risk-free. |

Keep existing `core`, `satellite`, and `risk_capital` keys, copy, default `core`, and risk-capital warning unchanged. In particular, do not globally relabel legacy `core` as “Growth core”: existing users may have assigned non-growth assets there. Order the selector `core`, `ballast`, `satellite`, `risk_capital`. Use the existing neutral outline badge for ballast; the text label distinguishes it without a new color system.

Recommend **no automatic backfill**. Every existing sleeve remains as stored. The owner can open the existing holding editor and change their intended SGOV holding from core to ballast, preserving its broker and all other fields. Do not infer this change for other SGOV holders, bond funds, cash-like symbols, or every legacy core holding. Do not introduce a persistent prompt/dismissal schema for this small change. Announce availability in the release handoff with the existing edit path.

This classification decision makes the reported sleeve split trackable. Tracking a target split and letting that split affect planner suggestions requires a separately approved planner proposal and finance validation; QA-INVEST-2 must not be closed with a claim that those capabilities were delivered.

## 3. Architecture and exact implementation seams

Keep the existing TypeScript/Next.js, Supabase user-session client, Zod, and bigint valuation layers. No new external tooling or reusable skill is needed. The data flow stays: create/edit selector → validated Server Action → RLS-protected `holdings.sleeve` → valued holding rows → sleeve allocation buckets and snapshot JSON → translated chart/badge.

| Workspace-root-relative file | Required change or verification |
|---|---|
| `project/jodsa/db/migrations/0010_invest_ballast_sleeve.sql` | Proposed next filename; recheck numbering at implementation. Hand-author a CHECK-constraint expansion only. Do not edit historical migration 0008 or regenerate the stale Drizzle journal. |
| `project/jodsa/db/schema.ts` | Add `ballast` to the sleeve text enum metadata; preserve nullability and default. |
| `project/jodsa/lib/supabase/types.ts` | Add `ballast` to holdings Row, Insert, and Update unions. |
| `project/jodsa/lib/validators/invest.ts` | Extend `SLEEVES` in the chosen order; creation and update schemas inherit it. Keep target allocation keyed by asset class. |
| `project/jodsa/app/(app)/invest/invest-client.tsx` | Existing selectors iterate `SLEEVES`. Add contextual helper and verify create/edit, holding list/detail badges, state restoration, and unchanged risk-capital warning. |
| `project/jodsa/messages/th.json`, `project/jodsa/messages/en.json` | Add ballast and helper keys; update the field/heading copy above. Preserve legacy option labels. |
| `project/jodsa/app/actions/invest/holdings.ts` | Existing authenticated `createClient()` / Zod create-update path should support the enum addition. Verify it preserves valuation and broker on a classification-only edit. No direct DB or service-role request path. |
| `project/jodsa/app/(app)/invest/page.tsx`, `project/jodsa/app/(app)/invest/portfolio-dashboard.tsx` | Verify the fourth bucket flows through and resolves its translated label, including snapshot history. Do not replace existing aggregation with hard-coded bucket math. |
| `project/jodsa/lib/invest/portfolio.ts`, `project/jodsa/app/actions/invest/portfolio.ts` | Verify unchanged grouping/serialization includes ballast and preserves missing-FX exclusion, existing rounding, and zero-value semantics after QA-INVEST-1. |
| `project/jodsa/lib/invest/planner/allocation.ts`, `project/jodsa/lib/invest/planner/plan.ts` | No algorithm change. Add a fixture proving core→ballast invariance. |

### Migration and persistence contract

The deployed constraint name is unverified. In a non-production database, inspect `pg_constraint` for the CHECK belonging to `public.holdings.sleeve`; the historical unnamed CHECK normally produces `holdings_sleeve_check`, but deployment must verify its actual name and definition. Abort on a missing/unexpected definition rather than dropping unrelated constraints or using a silent `IF EXISTS` that hides drift.

In one transaction, replace that constraint with a named CHECK permitting exactly `core`, `ballast`, `satellite`, `risk_capital`. Preserve `NOT NULL`, default `core`, indexes, grants, foreign keys, ownership, RLS enablement, and all existing policies. Do not update any row or rewrite `asset_transactions`, `portfolio_snapshots`, or `plans`. Reapplying migration SQL should report already-applied or fail clearly through the chosen migration procedure, not mutate the classification data.

Saved snapshots retain their historical sleeve classifications; new snapshots reflect the current classification. Do not retroactively reinterpret a historical core bucket as growth core or split it by present-day holdings. Persisted plans are historical records and remain unchanged. A new ballast classification does not populate missing `proxy_class` values or bypass the existing planner classification gate.

## 4. Verification and acceptance

1. **Validators and database contract:** valid create/update payloads accept all four values; invalid strings still reject; omitted create sleeve remains core. The migrated database accepts ballast, rejects unknown values and NULL, and retains default core. Compare existing row counts and classification counts immediately before/after migration; they must match exactly.
2. **Allocation and history:** use synthetic, convertible holdings with core value 600, ballast 200, satellite 100, risk capital 100 in one currency. Expect four buckets 60/20/10/10 and an unchanged total of 1000. Also exercise same asset in different sleeves so asset-level concentration merges do not erase the sleeve split. Verify an old snapshot without ballast still renders and a new snapshot includes it. These are test values, not the owner's real allocation.
3. **Classification-only edit:** edit an existing core holding to ballast via the real action/UI, reload, and compare broker, quantity, transaction IDs/count, cost, current value/currency, and FX to the before state. Only sleeve and normal `updated_at` change; total value and P&L do not. Canceling an edit saves nothing.
4. **Planner invariance:** pass otherwise identical resolved holdings and fixed plan inputs with one sleeve changed from core to ballast. Drift, concentration, stress, risk-capital percentage, suggestions, and verdict must match. Also verify an unclassified ballast asset still blocks planning and risk-capital percentage still counts only risk-capital holdings.
5. **Tenant isolation:** extend `project/jodsa/tests/unit/rls.test.ts` against an approved test DB: user A creates/updates their ballast holding; user B cannot read, update or delete it, or insert a row claiming A's identity; user A's row is unchanged after denied operations. Preserve existing risk-capital assertions. Compare policy definitions and RLS flags before/after migration.
6. **Browser/i18n:** add a focused Playwright flow alongside `project/jodsa/tests/e2e/invest-m1.spec.ts` / `invest-m3.spec.ts`: create ballast holding, reload, edit existing core→ballast, verify badge and allocation labels in Thai/English, then risk-capital warning regression. Use QA accounts, not owner holdings. Run `pnpm -s tsc --noEmit`, `pnpm -s vitest run`, relevant Playwright tests, and the project's normal lint gate. Report skipped live-RLS verification explicitly.

The implementation author supplies passing evidence; qa-lab independently verifies behavior and pm-desk checks approved scope. This proposal's author does not certify implementation.

## 5. Staged rollout and approval boundary

1. **Decision (S — approved 2026-10-10):** owner approved the four-value sleeve model, copy, unchanged default/legacy core meaning, explicit manual reclassification, and reporting-only scope. The matching canonical amendment and dated Changelog are in `idea-forge/ideas/jodsa-investments/`; the parent session files the SPEC brief in `project/jodsa/REVIEW-INBOX.md` to coordinate the shared inbox.
2. **Build and non-production proof (M, depends on 1):** route bounded implementation/tests through Antigravity first under workspace rules. Read the repo's Supabase RLS skill before touching the migration. Implement the listed seams, use a reviewed test migration, and obtain independent QA/PM evidence. Coordinate shared UI/portfolio files with QA-INVEST-1's work. Show exact SQL and migration preflight/rollback procedure to the owner.
3. **Live migration and release (S, depends on 2):** obtain explicit owner authorization to apply the exact migration to live Supabase. The project inbox explicitly prohibits auto-apply. After approval, verify live constraint/policies and apply the atomic expansion before deploying the application that writes ballast. With no ballast rows written yet, old code continues handling its three known values. Verify the deployment handles all four before any manual reclassification. The owner then uses the normal UI to reclassify selected holdings; no migration or agent backfill is implied.

Rollback before any ballast write can restore the original CHECK if the owner authorizes it. After ballast exists, do not shrink the CHECK or deploy old code lacking its label/type support: prefer a forward fix or compatible app rollback retaining ballast reads. Any destructive down-migration requires explicit row-by-row reclassification authorization; never silently collapse ballast back into core. Record deployed version and DB preflight/postflight evidence in the eventual implementation handoff.

## 6. Risks and open decisions

| Risk | Impact | Mitigation |
|---|---|---|
| Readers interpret role labels as guaranteed safety | Misleading product meaning | Role-based field wording and contextual helper; no automatic classification. |
| A bulk backfill overwrites users' intent | Incorrect portfolio history | No backfill SQL or symbol-based defaults; explicit per-holding edits. |
| New UI runs before DB accepts ballast | Save errors | Approved migration first, application release second, controlled smoke test. |
| Legacy application sees ballast after rollback | Missing labels or rejected edits | Retain read support; use compatible rollback/forward fix after first write. |
| Review claims planner sleeve targets now work | False completion of financial behavior | Pin asset-class drift semantics and planner invariance test; separately scope target-aware planning. |
| Changes overlap QA-INVEST-1 valuation work | Lost edits or misleading fixture denominator | Coordinate ownership, integrate on its final behavior, and test real holdings through current valuation. |

**Approval remaining:** separate owner authorization of the exact live migration. **Unverified by this planning artifact:** production constraint identity, current owner holdings/weights, live policy state, migration execution and proposed tests. This document and the canonical blueprint record approved scope; implementation/testing status belongs to the dev/QA handoff. This planning amendment changes no app code, schema or production data.
