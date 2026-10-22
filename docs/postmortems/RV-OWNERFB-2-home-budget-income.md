# RV-OWNERFB-2 — Home budget counted income as spending

## Summary

The Home monthly-budget strip treated every income row as spending, so mixed activity could reduce the displayed remaining budget or falsely show an over-budget state. The fix makes `spentForBudget` enforce the expense-only invariant and adds mixed income/expense unit and browser coverage. Tracking item: `[RV-OWNERFB-2]`; fix branch: `main`.

## Symptom

With a ฿10,000 monthly budget, a ฿500 expense, and ฿1,200 income, Home showed ฿1,700 spent and ฿8,300 remaining. The deterministic unit regression initially failed with `expected 170000 to be 50000` in `tests/unit/budget.test.ts`.

## Root cause

`app/(app)/dashboard/page.tsx` deliberately loads both `income` and `expense` rows into `monthTx` because the same result also feeds `buildLastAccountMap`. It passed that mixed array to `budgetStatus`. In `lib/budget.ts`, `ExpenseRow` did not carry a transaction type and `spentForBudget` summed every in-period row. The expense-only rule therefore existed only as a caller convention, and Home violated that convention when it reused a mixed-purpose query.

## Why it produced the symptom

`budgetStatus` derives `spent`, `remaining`, `ratio`, and `over` from `spentForBudget`. Adding income to `spent` therefore affected every value rendered by `HomeBudgetStrip`: the remaining amount, progress fill, daily allowance, and over-budget state.

## Fix

`ExpenseRow` now includes `type`, and `spentForBudget` skips every row whose type is not `expense`. This puts the invariant at the aggregation boundary instead of relying on every caller to pre-filter. The Home B2 fixture now contains both a ฿500 expense and ฿1,200 income while retaining the ฿9,500 remaining-budget assertion.

## How it was found

The mixed-row unit test reproduced the bug deterministically. Source tracing connected the Home `monthTx` query to `budgetStatus` and then to the unguarded sum in `spentForBudget`. Timezone and category-filter hypotheses were rejected because the incorrect result was exactly ฿500 + ฿1,200. The confirming experiment added an income row without changing the expected expense total; it failed before the guard and passed after it.

## Why it slipped through

The unit suite supplied only expense-shaped rows, while the Home E2E fixture contained only an expense. The helper's name and type implied expense-only input but did not encode or enforce the invariant, so the mixed Home query remained uncovered.

## Validation

- `pnpm -s vitest run tests/unit/budget.test.ts`: 6 passed, including `ignores income when income and expense rows are mixed`.
- `pnpm -s tsc --noEmit`: exit 0.
- `pnpm -s exec playwright test tests/e2e/m9-home-restructure.spec.ts --reporter=line`: 6 passed; the B2 fixture contains ฿1,200 income and still renders `เหลือ ฿9,500.00 จาก ฿10,000.00` with `aria-valuenow=50000`.
- A full 110-test E2E run was attempted. The first 35 tests passed, after which unrelated signup, isolation, balance, budget, and group journeys timed out at 120 seconds; the run was stopped after the repeated cross-feature timeout pattern. It is not a green full-suite result.

## Action items

None — the aggregation boundary now enforces the invariant and both unit and browser regression coverage exercise mixed rows.
