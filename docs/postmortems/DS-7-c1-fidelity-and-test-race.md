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

## F5 addendum: rendered link contrast

### Summary

Three action links in the manual-entry and C1 sheets rendered the Honey fill colour as text and failed WCAG text contrast in light mode. Replacing their `text-primary` utilities with the existing semantic `text-honey-text` mapping fixed the defect without changing tokens or C1 behaviour.

### Root cause and mechanism

`components/display-name-field.tsx` and `components/reconcile-account-sheet.tsx` used `text-primary`. `--primary` is the bright Honey fill intended for filled controls, not text on the cream sheet surface. Chromium resolved that combination to `#f1b219` on `#fffdf7`, producing 1.86:1 contrast. The existing `m9-contrast.spec.ts` checked token pairs in isolation but never inspected these rendered elements, so the misuse was outside its coverage.

### Fix

The three links now use `text-honey-text`, whose light and dark mappings already exist. `tests/e2e/m9-contrast.spec.ts` opens the real user-A forms and measures each element's computed foreground against its nearest painted ancestor with the WCAG relative-luminance formula. It checks both themes and uses no snapshots.

### Validation

With the original classes, all three light-mode checks failed deterministically at 1.86:1; dark mode passed. With `text-honey-text`, the production contrast suite passed in light and dark. One combined production run for contrast, C1 and A3 passed 10/10 including setup. A later repeat exposed a C1 browser/Postgres clock-domain bug (`ลงแล้ว (4)` instead of `(2)`), not a fixture race; the immediate isolated pass did not disprove a clock-dependent defect. RV-C1-1 below records the correction and fix. `pnpm -s tsc --noEmit --incremental false` exited 0; Vitest passed 352 tests and skipped 34 live-RLS tests.

### Action items

None — the rendered-element regression test closes the coverage gap.

## RV-C1-1 addendum: browser and Postgres clock domains

### Summary

The C1 `ลงแล้ว` list used a browser timestamp to select rows whose `created_at` was stamped by Postgres. Device clock skew therefore added pre-session rows or hid rows saved during the session. The fix removes time from the identity boundary: `createTransaction` returns the inserted id, C1 retains ids from its own saves, and the state read filters by those ids.

### Symptom

With Playwright `page.clock` fixed two minutes behind the server, two C1 saves rendered `ลงแล้ว (11) · ฿593.00`, including nine seeded rows. With the browser fixed two minutes ahead, the Gap Bar moved after both saves but the `ลงแล้ว` summary was absent. The expected result in both cases was `ลงแล้ว (2) · ฿107.00`.

### Root cause

`ReconcileAccountSheet.begin()` stored `new Date().toISOString()` from the browser in `sessionStartedAt`. After each save, `getAccountReconcileState(accountId, sessionStartedAt)` compared that client value with the database-owned `transactions.created_at` using `.gte('created_at', sessionStartedAt)`. The comparison assumed browser and Postgres clocks shared one trustworthy timeline. A slow browser clock widened the query backwards into older rows; a fast browser clock moved the lower bound beyond newly inserted rows.

### Why it produced the symptom

The Gap Bar remained correct because it re-read `account_balances()` and never used `sessionStartedAt`. Only the presentation list used the cross-clock filter, so balance arithmetic could be correct while `ลงแล้ว` showed the wrong count and total. An immediate isolated rerun could pass whenever the two clocks happened to be close enough, which made the first failure look like fixture timing.

### Fix

`createTransaction` now selects and returns the inserted transaction id. `TransactionForm.onSuccess` accepts that optional id; existing callers that ignore callback arguments keep their prior behaviour. C1 appends each returned id to `savedTransactionIds`, and `getAccountReconcileState` filters the account-scoped transaction query with `.in('id', savedTransactionIds)`. No timestamp participates in session membership. The change does not touch `performReconcileRemainder`, gap calculation, stale detection, or `reconciled_at`.

### How it was found

The review traced the value across the browser/server boundary instead of treating the intermittent C1 assertion as a fixture-only race. Fixing `page.clock` at ±2 minutes made both failure directions deterministic: −2 minutes included nine old rows, and +2 minutes excluded both new rows. Those opposing results falsified a generic rendering race and isolated the clock-domain comparison.

### Why it slipped through

The original C1 E2E used an unmodified device clock. Its pass depended on browser and database clocks being close, and an isolated rerun could pass after a combined-run failure. The suite had no skewed-clock coverage at the boundary where browser time was compared with a database timestamp.

### Validation

- The two `page.clock` regressions pass at −2 and +2 minutes and each assert exactly `ลงแล้ว (2) · ฿107.00`.
- The full production C1 file passed 16/16 with `--repeat-each 5`, including setup.
- Production A3 and contrast regressions passed 9/9, including setup.
- `pnpm -s tsc --noEmit --incremental false` exited 0. Vitest passed 352 tests and skipped 34 live-RLS tests.

### Action items

None — id-based session membership removes the clock assumption, and the skew tests guard both failure directions.
