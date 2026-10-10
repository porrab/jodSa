# QA-INVEST-1 — Closed holding retained a stale market value

## Summary

A fully sold holding remained visible with zero units but kept its last manually entered market value, unrealized P&L, and concentration weight. The fix makes ledger quantity authoritative for closed positions: quantity zero produces zero cost, value, and unrealized P&L; closed positions remain in the historical holdings list but are excluded from concentration and planning inputs. The fix is in the commit that adds this record.

## Symptom

The owner sold all `0.0140444` ASML units, but `/invest` still showed `US$25.49`, portfolio total remained `฿21,278.73`, and ASML retained a `4.0%` concentration slice. Cost basis had reached zero, proving the sell transaction was recorded while the presentation and planner paths still consumed the stored valuation.

## Root cause

`valueHolding()` in `lib/invest/portfolio.ts` computed quantity from `asset_transactions` but treated `holdings.current_value_minor` as independently valid. A full sale reduced `computeCostBasis().qty` and remaining cost to zero, while the holding row retained its last manually entered current value. `valueHolding()` therefore returned the stale value and a positive unrealized P&L. `computeConcentration()` then included that valued row.

`app/(app)/invest/invest-client.tsx` duplicated the same assumption by rendering `current_value_minor` directly in both the Assets row and holding detail. The planner action also needed a second boundary: after zero-valuing a closed foreign custom holding, that historical row could still reach `resolveHoldings()` and block generation on a missing proxy classification. Closed rows have no current portfolio risk, so they must not enter planner inputs.

## Why it produced the symptom

The transaction ledger and the manual valuation live in different tables. Recording a sell updates only `asset_transactions`; it does not clear the holding's manual valuation. Before this fix, no shared valuation rule reconciled those facts. Every downstream calculation that trusted the stale holding value counted a position that no longer existed.

## Fix

`valueHolding()` now short-circuits when ledger quantity is zero and returns zero cost, value, unrealized P&L, and effective value without requiring FX. `getHoldingDisplay()` gives the Assets row and detail sheet the same rule. Concentration filters zero-quantity positions, and `mapToResolveInputs()` excludes closed positions before classification while keeping every positive-quantity holding in the planner pipeline. The mapper is typed from the generated Supabase row definitions so nullability and transaction types remain checked by TypeScript.

Partial sales deliberately keep the existing manual total-value convention. Reopening a holding makes quantity positive again, so its normal valuation, FX, and classification requirements resume.

## How it was found

The production report provided a deterministic full-sale sequence. Source tracing followed the row from `asset_transactions` through `computeCostBasis()`, `valueHolding()`, the Assets UI, concentration, and planner resolution. The disproof case was a positive-quantity zero-value unclassified holding: it must still block planning. Focused tests cover that boundary together with full, fractional, missing-FX, partial-sale, and closed custom-asset cases.

## Why it slipped through

The original portfolio tests covered aggregation of active holdings but did not combine a full sale with a stale manual valuation. UI and planner code also derived the same concept separately, so the correct ledger quantity did not constrain every consumer.

## Validation

- `pnpm -s vitest run tests/unit/invest/portfolio.test.ts tests/unit/invest/planner/resolve.test.ts tests/unit/invest/planner/plan.test.ts` — 3 files, 49 tests passed.
- `pnpm -s tsc --noEmit` — exit 0.
- `pnpm -s vitest run` — 21 files passed, 1 file skipped; 311 tests passed, 34 RLS tests skipped because live Supabase credentials were not enabled for this run.
- `pnpm -s lint` — no warnings or errors.
- QA-owned browser validation of the original action/UI/database path is pending independent execution; production owner data was not modified.

## Action items

- Independent QA runs `tests/e2e/review-20261010.spec.ts` against synthetic users before closure. Owner: qa-lab, tracked in `project/jodsa/REVIEW-INBOX.md` under QA-INVEST-1.
