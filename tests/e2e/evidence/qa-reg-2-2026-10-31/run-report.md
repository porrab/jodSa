# QA-REG-2 production-build rerun — 2026-10-31

## Scope and boundary

- Local production build: `pnpm build` succeeded; `pnpm start --port 3100` served the full and focused runs.
- Test users A/B only. No owner reads/writes, migration, or push. Service-role writes in cleanup are filtered by the verified A/B user IDs; count proof uses each user's authenticated client.
- Existing tracked visual baselines and old untracked evidence were left intact. New screenshots are under this dated folder.
- [Classification of all 41 prior failures](classification.md).

## Focused OCR and visual recheck

- `focused-ocr-results.json`: 4 passed (including setup), 0 failed, 0 skipped, 0 flaky.
- Field-2: 13/13 slips reached confirm; expected bill recipients remained empty.
- M2-S5: amount 10/12 (gate ≥9/12), counterparty 2/2. Remaining blank amounts are two TTB bill layouts already documented as the accepted `QA-M2-1` limitation in `REVIEW-INBOX.md`; no duplicate bug was filed.
- Light-sessions visual matched the unchanged baseline after clearing A-owned payment sessions. [Expected](light-sessions-expected.png) · [Actual](light-sessions-actual.png) · [Diff](light-sessions-diff.png) from the original failure.
- Prior field-2 trace showed the empty dropzone after `setInputFiles`; one-off A-session repro with a hydration wait reached confirm 3/3 at ฿40.00 ([log](ocr-minimal-repro.jsonl)).

## Other gates

- Raw `pnpm exec tsc --noEmit --incremental false`: exit 0 ([stdout](tsc-final.log), [stderr](tsc-final-stderr.log)).
- `pnpm exec vitest run`: **367 passed, 34 skipped, 0 failed**; 29 files passed and 1 skipped ([log](vitest-final.log)). The 34 live RLS tests skip because `.env.test` is not loaded into this Vitest process.

## Full suite

`pnpm exec playwright test --reporter=json` against `pnpm start --port 3100`:
**172 tests / 48 files: 153 passed, 1 failed, 18 skipped, 0 flaky**. See [the per-spec table, every skip reason, error and screenshot path](full-final-4-summary.md), plus [raw JSON](full-final-4-results.json).

- The only unexpected failure is `honey-visual.spec.ts` → `light add manual, transfer, and slip surfaces`: `toHaveScreenshot(light-add-manual.png)` differs by **11,555 pixels**. The live UI includes A3's optional display-name control from `45f8c62`, absent from the unchanged baseline. [Expected](light-add-manual-expected.png) · [Actual](light-add-manual-actual.png) · [Diff](light-add-manual-diff.png). Baseline review by the owner is pending.
- 16 honey visual tests were skipped because that suite runs serially after the failed snapshot. M5-S3 was intentionally skipped because deleting an auth identity would violate the A/B-only boundary. M7-D due-later was skipped on 2026-10-31 because no later day exists in this month. All 18 skips are explained in the linked summary.
- A diagnostic full run before the last two assertion fixes was 148 passed / 3 failed / 21 skipped / 0 flaky; focused M1 then passed 3/3 including setup, and all four M2 slip-import tests passed. Two later diagnostic runs exposed pre-hydration upload and group-navigation races; the corrected upload and group tests passed focused checks before the final full run. Those interrupted diagnostics are not presented as full-suite verdicts.

## C1/A3/contrast/C2 repeat 3

**61 passed, 0 failed, 0 skipped, 0 flaky** ([per-spec summary](repeat3-summary.md), [raw JSON](repeat3-results.json)). A3 12, C1 12, C2 18, contrast 18, setup 1.

## A/B cleanup

The [cleanup script](cleanup-test-user-rows.cjs) verified A and B through their own password sessions and used only service-role writes filtered by those exact IDs; both report `cleaned: true` ([output](cleanup-output.jsonl)). The [count script](count-test-user-rows.cjs) then queried each user's RLS-scoped session. Both A and B returned **0** in all 11 tables: `accounts`, `transactions`, `budgets`, `groups`, `recurring_rules`, `holdings`, `asset_transactions`, `portfolio_snapshots`, `plans`, non-system `assets`, and `payment_sessions` ([counts](cleanup-counts.jsonl)). No owner row was read or changed.
