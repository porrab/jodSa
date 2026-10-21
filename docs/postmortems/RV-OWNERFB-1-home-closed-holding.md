# RV-OWNERFB-1 — Home counted a fully sold holding

## Summary

Home counted a holding's last manually stored market value after its ledger quantity had reached zero. The fix makes Home read the investment ledger and apply the same closed-position rule as `/invest`: a zero-quantity holding contributes nothing and is absent from the Home breakdown. The fix is in the commit that adds this record.

## Symptom

The Home investment sub-line and combined money headline could exceed the `/invest` portfolio total. Opening the Home breakdown also listed a fully sold holding with its stale `current_value_minor`, even though `/invest` correctly valued that position at zero under QA-INVEST-1.

## Root cause

`app/(app)/dashboard/page.tsx` queried `holdings` and `assets` but not `asset_transactions`. It called `valueCurrentHolding()`, which converted `current_value_minor` and its FX rate without knowing the ledger quantity. Recording a full sale appends a ledger row; it deliberately does not clear the manually entered valuation on the holding row. Home therefore had no fact that could distinguish an active position from a closed historical position.

## Mechanism

The `/invest` route groups transactions by holding, computes cost basis, and treats `qty === 0` as authoritative before using a stored valuation. Home had introduced a second, value-only path for the B1 headline. That path summed every holding row and passed the same unfiltered rows to `BalanceBreakdownSheet`, so the stale value affected both displays.

## Fix

`valueCurrentHolding()` now accepts the holding ledger, derives quantity through `computeCostBasis()`, and returns zero immediately when quantity is zero. The dashboard loads the minimal transaction columns, groups them by holding, and drops zero-quantity positions before constructing `homeHoldings`. The investment total and breakdown therefore consume the same filtered collection, while active holdings retain the existing THB and FX conversion behavior.

## How it was found

Source review compared the new Home B1 path with the QA-INVEST-1 `/invest` path. A focused unit fixture with one buy, one full sell, and a deliberately stale stored value reproduced the defect: ledger quantity was zero but Home valuation returned `120000n` instead of zero.

## Why it slipped through

B1 tests covered active and missing-value holdings but did not include a full-sale ledger. The Home implementation optimized for a lightweight current-value read and bypassed the already established ledger-authoritative invariant. No cross-route assertion compared Home's investment sub-line with the `/invest` portfolio total.

## Validation

- Pre-fix focused unit test: failed as expected (`120000n` received, `0n` expected).
- `pnpm -s vitest run tests/unit/invest/portfolio.test.ts`: 27 tests passed.
- `pnpm -s vitest run`: 332 tests passed; 34 live-RLS tests skipped.
- `pnpm -s tsc --noEmit`: exit 0.
- `pnpm -s lint`: no warnings or errors.
- `pnpm -s playwright test tests/e2e/m9-home-restructure.spec.ts --project=chromium`: 5 tests passed. The fixture contains an active ฿1,000 holding plus a fully sold holding whose stored value remains ฿5,000; Home and `/invest` both render ฿1,000 and the Home breakdown exposes only the active holding.

## Prevention

Keep ledger-derived quantity as the authority for every investment surface. Any new portfolio summary must cover a closed holding with a stale stored valuation and compare its total with the canonical `/invest` aggregation.
