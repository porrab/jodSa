# full-final-4 Playwright result

Stats: {'startTime': '2026-10-31T03:29:13.520Z', 'duration': 1291328.468, 'expected': 153, 'skipped': 18, 'unexpected': 1, 'flaky': 0}

| Spec | Pass | Fail | Skip | Flaky |
| --- | ---: | ---: | ---: | ---: |
| a3-display-name.spec.ts | 4 | 0 | 0 | 0 |
| anon-deny.spec.ts | 4 | 0 | 0 | 0 |
| ballast.spec.ts | 7 | 0 | 0 | 0 |
| c1-reconcile.spec.ts | 4 | 0 | 0 | 0 |
| c2-invest-divest.spec.ts | 6 | 0 | 0 | 0 |
| ds2-home-evidence.spec.ts | 4 | 0 | 0 | 0 |
| ds3-form-row.spec.ts | 3 | 0 | 0 | 0 |
| ds5-date-hydration.spec.ts | 2 | 0 | 0 | 0 |
| ds5-open-items.spec.ts | 4 | 0 | 0 | 0 |
| ds6-polish.spec.ts | 5 | 0 | 0 | 0 |
| field-1-mobile-save.spec.ts | 2 | 0 | 0 | 0 |
| field-2-counterparty-capture.spec.ts | 1 | 0 | 0 | 0 |
| global.setup.ts | 1 | 0 | 0 | 0 |
| honey-visual.spec.ts | 11 | 1 | 16 | 0 |
| invest-m1.spec.ts | 6 | 0 | 0 | 0 |
| invest-m3.spec.ts | 5 | 0 | 0 | 0 |
| invest-m5.spec.ts | 9 | 0 | 0 | 0 |
| m1-1-signup-journey.spec.ts | 2 | 0 | 0 | 0 |
| m1-2-isolation.spec.ts | 1 | 0 | 0 | 0 |
| m1-3-balance-sync.spec.ts | 2 | 0 | 0 | 0 |
| m2-s5-accuracy.spec.ts | 1 | 0 | 0 | 0 |
| m2-slip-import.spec.ts | 4 | 0 | 0 | 0 |
| m3-budgets.spec.ts | 1 | 0 | 0 | 0 |
| m3-groups.spec.ts | 1 | 0 | 0 | 0 |
| m3-recurring.spec.ts | 1 | 0 | 0 | 0 |
| m4-guest-pay.spec.ts | 4 | 0 | 0 | 0 |
| m5-settings.spec.ts | 2 | 0 | 1 | 0 |
| m7-dup-override.spec.ts | 1 | 0 | 0 | 0 |
| m7-edit-transaction.spec.ts | 1 | 0 | 0 | 0 |
| m7-recurring-deducts.spec.ts | 1 | 0 | 1 | 0 |
| m8-account-mapping.spec.ts | 3 | 0 | 0 | 0 |
| m9-contrast.spec.ts | 6 | 0 | 0 | 0 |
| m9-groups-filter.spec.ts | 2 | 0 | 0 | 0 |
| m9-home-restructure.spec.ts | 5 | 0 | 0 | 0 |
| m9-onboarding.spec.ts | 5 | 0 | 0 | 0 |
| m9-trip.spec.ts | 2 | 0 | 0 | 0 |
| ownerfb-a1-slip-queue.spec.ts | 3 | 0 | 0 | 0 |
| review-20261010.spec.ts | 5 | 0 | 0 | 0 |
| spec5-optimistic.spec.ts | 3 | 0 | 0 | 0 |
| spec5-visual.spec.ts | 7 | 0 | 0 | 0 |
| trip-1-create-share.spec.ts | 1 | 0 | 0 | 0 |
| trip-2-join-ledger.spec.ts | 1 | 0 | 0 | 0 |
| trip-3-expense-split.spec.ts | 1 | 0 | 0 | 0 |
| trip-4-authz-dedup.spec.ts | 2 | 0 | 0 | 0 |
| trip-4-slip-ui.spec.ts | 1 | 0 | 0 | 0 |
| trip-5-owner.spec.ts | 1 | 0 | 0 | 0 |
| trip-6-security.spec.ts | 4 | 0 | 0 | 0 |
| trip-7-regression-ux.spec.ts | 1 | 0 | 0 | 0 |

## Skips

- **honey-visual.spec.ts: dark home** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark transactions** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark accounts** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark budgets** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark invest** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark recurring** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark groups** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark import** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark sessions** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark more** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark settings** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark add manual, transfer, and slip surfaces** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: light login** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: light signup** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark login** — serial suite skipped after failed in the same spec
- **honey-visual.spec.ts: dark signup** — serial suite skipped after failed in the same spec
- **m5-settings.spec.ts: M5-S3 account deletion cascades and signs out** — intentionally skipped: deleting an auth identity needs a disposable user beyond the permitted test accounts A/B.
- **m7-recurring-deducts.spec.ts: QA-M7D-2 a rule due later this month does NOT deduct early (≤-today clamp)** — too close to month-end to place a due-later date this month

## Failures and flakes

- **honey-visual.spec.ts: light add manual, transfer, and slip surfaces** (unexpected)
  - Error: Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed
  - Screenshot: `E:\claudeWorkSpace\project\jodsa\tests\e2e\evidence\qa-reg-2-2026-10-31\full-final-4\failures\honey-visual.spec.ts-light-add-manual-transfer-and-slip-surfaces\light-add-manual-chromium-win32.png`
  - Screenshot: `E:\claudeWorkSpace\project\jodsa\tests\e2e\evidence\qa-reg-2-2026-10-31\full-final-4\failures\honey-visual.spec.ts-light-add-manual-transfer-and-slip-surfaces\light-add-manual-actual.png`
  - Screenshot: `E:\claudeWorkSpace\project\jodsa\tests\e2e\evidence\qa-reg-2-2026-10-31\full-final-4\failures\honey-visual.spec.ts-light-add-manual-transfer-and-slip-surfaces\light-add-manual-diff.png`
  - Screenshot: `E:\claudeWorkSpace\project\jodsa\tests\e2e\evidence\qa-reg-2-2026-10-31\full-final-4\failures\honey-visual.spec.ts-light-add-manual-transfer-and-slip-surfaces\test-failed-1.png`
