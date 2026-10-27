# DS-7: C1 Honey fidelity and DS-3 visual-order race

## Summary

The C1 flow was behaviourally correct but four surfaces did not match the approved Honey frames. During verification, the DS-3 visual-order test also failed even though the rendered category remained above the account grid. Commits `aa19efd`–`826ab43` corrected the C1 presentation without changing its server contract; `ac8a391` made the DS-3 measurement atomic.

## Symptom

- Figma/app comparisons for `29:2211`, `30:2231`, `30:2258`, and `30:2390` showed the DS-7 F1–F4 differences recorded in `REVIEW-INBOX.md`.
- `ds3-form-row.spec.ts` failed with category `y=811.24` and account `y=513`, while its failure screenshot and accessibility snapshot showed the category above the account.

## Root cause

The C1 UI used legacy list/input treatments and omitted several frame-specific presentation states. Two Honey surfaces also used `bg-honey-soft`, but Tailwind exposes the brief's honey-soft token through `--secondary`; no `--color-honey-soft` mapping exists, so the class generated no visible fill.

The DS-3 test called `boundingBox()` on the category and account locators sequentially while the Radix bottom sheet was entering. The first position came from an earlier animation frame and the second from a later frame. Comparing those absolute coordinates produced a false reversal even though both elements moved together and their relative order never changed.

## Why it produced the symptom

The missing Tailwind colour mapping made correctly named-looking classes render transparently, which was visible only in the image pair. For DS-3, the sheet's vertical transform changed between the two asynchronous browser round trips, so coordinates from different frames could not safely be compared.

## Fix

- F1–F4 use the approved `bg-secondary` Honey surface and frame-specific card, amount, date, lock, saved-row, info, warning, and actual-type treatments.
- `TransactionForm.hideDatetimeField` lets C1 provide one controlled datetime row while preserving the submitted `datetime` payload.
- `expectCategoryBeforeAccount` reads both rectangles inside one `evaluate()` call, keeping the visual-order assertion while sampling one animation frame.
- The read-only slip-confirm display-name E2E was restored and verifies that the user-A transaction count does not change.

## How it was found

The four 390×844 image pairs exposed the transparent Honey surfaces. The DS-3 failure reproduced both in the combined suite and alone. Source order, failure screenshot, and accessibility snapshot disproved an app-layout regression; the mismatched absolute offsets identified the cross-frame measurement race. Replacing the two reads with one browser evaluation made the same production test deterministic.

## Why it slipped through

The first C1 evidence pass compared structure and content but did not catch that `bg-honey-soft` was not a registered Tailwind colour. The DS-3 test assumed two sequential geometry reads occurred after the entrance animation, but visibility does not imply animation completion.

## Validation

- Production build: exit 0; existing unused-import warnings remain.
- C1 production E2E: 2/2 including setup after the final Honey-token correction.
- DS-3 production E2E: 4/4 including setup after atomic measurement.
- A3 combined production run: expense, transfer, 121-character rejection, and read-only slip display-name checks all passed; the read-only check left the user-A transaction count unchanged.
- Vitest: 352 passed, 34 live-RLS tests skipped.
- TypeScript: `pnpm -s tsc --noEmit --incremental false` exit 0.

## Action items

None. The corrected test covers the animation seam and the four inspected pairs are retained under `tests/e2e/evidence/ds-7-2026-10-27/`.
