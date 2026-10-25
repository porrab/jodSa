# DS-6 — Honey polish leftovers N2–N7

## Summary

The DS-6 review found six remaining presentation and copy-rule gaps across account creation, transaction entry, slip confirmation, investment holdings, and shared transaction rows. Commit `4e9e9c9` implements N2–N7, adds focused 390×844 E2E coverage, stores five Figma-left/app-right evidence pairs, and refreshes only the affected Honey baselines. Migration 0011 was not started.

## Symptom

- Account forms exposed stored bank codes such as `KIATNAKIN`, `LH Bank`, and `Other` in Thai UI.
- Expense entry and slip confirmation also offered income-only categories.
- Transfer entry used a standalone swap button rather than the anchored Swap Divider.
- Slip confirmation rendered `฿1250.00` without a thousands separator.
- Investment holding names and metadata wrapped when the verbose profit/loss label occupied the right column.
- `TransactionRowCopy` omitted category/payee metadata required by brief v6 when those values were not already the title.

The pre-fix focused E2E run failed deterministically on the bank-label assertion and on the DS-3 row-meta assertion: expected `18:59 · บัญชี B · เดินทาง`, received `18:59 · บัญชี B`.

## Root cause

- `accounts-client.tsx` and `account-quick-create-form.tsx` rendered `BANKS` values directly, coupling persisted codes to display copy.
- `transaction-form.tsx` and `slip-confirm-form.tsx` iterated the shared `CATEGORIES` list without considering transaction type. Type changes also retained a category that was invalid for the new type.
- The transfer control was a regular ghost `Button`, with no divider composition.
- `slip-confirm-form.tsx` formatted the OCR amount with `toFixed(2)` instead of the shared grouped-number formatter.
- The investment row reused `pnlLine`, copy intended for the detailed holding sheet, inside the constrained row.
- `TransactionRowCopy` only appended payee when an explicit display name existed and never appended a non-title category.

## Why it produced the symptom

Each issue was a direct rendering consequence of the source model: stored values became labels, an unfiltered enum became every visible chip, and detail-level copy consumed row width. The shared transaction-row branch had insufficient title-awareness, so it could not decide which category/payee values still belonged in metadata.

## Fix

Commit `4e9e9c9`:

- maps stable bank codes to localized display-label keys while preserving submitted values;
- introduces `categoriesForType`, filters both forms, and clears only invalid categories when type changes without changing `accountTouched` behavior;
- composes the swap action as an outlined pill anchored between two divider lines;
- formats OCR amounts through `formatTHBCompact`;
- keeps investment name/meta to one line and renders row P/L as a short signed amount while retaining the verbose label in the sheet;
- implements the brief-v6 title-aware `time · account · category · payee` rule in `components/transaction-row-copy.tsx`, including account omission on account-scoped rows;
- adds `tests/e2e/ds6-polish.spec.ts`, strengthens DS-3 assertions, and records the five required visual pairs.

## How it was found

The DS-6 Figma nodes made each visual mismatch reproducible at 390×844. Focused E2E assertions first established red evidence for N2 and N7. Source tracing then followed each visible value to its renderer or formatter. During final verification, one DS-3 position assertion raced the sheet layout; the screenshot showed the correct visual order, and waiting for both the category button and account radio before reading bounding boxes removed the test race without weakening the order check.

## Why it slipped through

Earlier coverage verified that the forms and rows rendered, but not the localized label/value boundary, type-specific category set, compact row copy, or exact title-aware metadata sequence. The affected Honey snapshots also predated the accepted brief-v6 copy rule.

## Validation

- Red-green: the focused pre-fix DS-3/N2 run failed on missing row metadata and raw bank labels; both assertions pass after `4e9e9c9`.
- `pnpm exec playwright test tests/e2e/ds6-polish.spec.ts tests/e2e/ds3-form-row.spec.ts --project=chromium --reporter=list`: 9 passed, 0 failed.
- `pnpm exec playwright test tests/e2e/honey-visual.spec.ts --project=chromium --reporter=list --grep "add manual"`: 3 passed, 0 failed, without update mode.
- `pnpm -s vitest run`: 334 passed; 34 live-RLS tests skipped.
- `pnpm -s tsc --noEmit --incremental false`: exit 0.
- Five inspected pairs are indexed in `tests/e2e/evidence/ds-6-2026-10-26/README.md`.

## Action items

- Design-studio re-reviews DS-6 from commit `4e9e9c9` and the five stored evidence pairs.
- No migration follow-up is part of this change; migration 0011 remains unstarted.
