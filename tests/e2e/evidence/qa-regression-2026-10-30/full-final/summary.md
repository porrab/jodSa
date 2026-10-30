# Playwright full-final

Stats: 103 passed, 41 failed, 28 skipped, 0 flaky; 7027422.581 ms.

| Spec file | Pass | Fail | Skip | Flaky |
| --- | ---: | ---: | ---: | ---: |
| a3-display-name.spec.ts | 4 | 0 | 0 | 0 |
| anon-deny.spec.ts | 4 | 0 | 0 | 0 |
| ballast.spec.ts | 6 | 1 | 0 | 0 |
| c1-reconcile.spec.ts | 4 | 0 | 0 | 0 |
| c2-invest-divest.spec.ts | 6 | 0 | 0 | 0 |
| ds2-home-evidence.spec.ts | 4 | 0 | 0 | 0 |
| ds3-form-row.spec.ts | 3 | 0 | 0 | 0 |
| ds5-date-hydration.spec.ts | 2 | 0 | 0 | 0 |
| ds5-open-items.spec.ts | 4 | 0 | 0 | 0 |
| ds6-polish.spec.ts | 5 | 0 | 0 | 0 |
| field-1-mobile-save.spec.ts | 2 | 0 | 0 | 0 |
| field-2-counterparty-capture.spec.ts | 0 | 1 | 0 | 0 |
| global.setup.ts | 1 | 0 | 0 | 0 |
| honey-visual.spec.ts | 8 | 1 | 19 | 0 |
| invest-m1.spec.ts | 5 | 1 | 0 | 0 |
| invest-m3.spec.ts | 3 | 2 | 0 | 0 |
| invest-m5.spec.ts | 8 | 1 | 0 | 0 |
| m1-1-signup-journey.spec.ts | 1 | 1 | 0 | 0 |
| m1-2-isolation.spec.ts | 0 | 1 | 0 | 0 |
| m1-3-balance-sync.spec.ts | 0 | 1 | 1 | 0 |
| m2-s5-accuracy.spec.ts | 0 | 1 | 0 | 0 |
| m2-slip-import.spec.ts | 0 | 1 | 3 | 0 |
| m3-budgets.spec.ts | 0 | 1 | 0 | 0 |
| m3-groups.spec.ts | 0 | 1 | 0 | 0 |
| m3-recurring.spec.ts | 0 | 1 | 0 | 0 |
| m4-guest-pay.spec.ts | 0 | 1 | 3 | 0 |
| m5-settings.spec.ts | 0 | 3 | 0 | 0 |
| m7-dup-override.spec.ts | 0 | 1 | 0 | 0 |
| m7-edit-transaction.spec.ts | 0 | 1 | 0 | 0 |
| m7-recurring-deducts.spec.ts | 0 | 1 | 1 | 0 |
| m8-account-mapping.spec.ts | 3 | 0 | 0 | 0 |
| m9-contrast.spec.ts | 6 | 0 | 0 | 0 |
| m9-groups-filter.spec.ts | 2 | 0 | 0 | 0 |
| m9-home-restructure.spec.ts | 3 | 2 | 0 | 0 |
| m9-onboarding.spec.ts | 3 | 2 | 0 | 0 |
| m9-trip.spec.ts | 2 | 0 | 0 | 0 |
| ownerfb-a1-slip-queue.spec.ts | 1 | 1 | 1 | 0 |
| review-20261010.spec.ts | 0 | 5 | 0 | 0 |
| spec5-optimistic.spec.ts | 0 | 3 | 0 | 0 |
| spec5-visual.spec.ts | 4 | 3 | 0 | 0 |
| trip-1-create-share.spec.ts | 0 | 1 | 0 | 0 |
| trip-2-join-ledger.spec.ts | 1 | 0 | 0 | 0 |
| trip-3-expense-split.spec.ts | 1 | 0 | 0 | 0 |
| trip-4-authz-dedup.spec.ts | 2 | 0 | 0 | 0 |
| trip-4-slip-ui.spec.ts | 1 | 0 | 0 | 0 |
| trip-5-owner.spec.ts | 0 | 1 | 0 | 0 |
| trip-6-security.spec.ts | 4 | 0 | 0 | 0 |
| trip-7-regression-ux.spec.ts | 0 | 1 | 0 | 0 |

## Failures and flakes

- **ballast.spec.ts: SPEC6-RLS B cannot read/update/delete A ballast or forge ownership; A row and ledger survive** (unexpected)
  - Error: Error: expect(locator).toHaveCount(expected) failed \| Locator:  getByRole('button', { name: 'ปตท. จำกัด (มหาชน)' }) \| Expected: 1 \| Received: 0 \| Timeout:  15000ms
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/ballast-SPEC6-RLS-B-cannot-161ce-ip-A-row-and-ledger-survive-chromium/test-failed-1.png, E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/ballast-SPEC6-RLS-B-cannot-161ce-ip-A-row-and-ledger-survive-chromium/test-failed-2.png
- **field-2-counterparty-capture.spec.ts: QA-FIELD-2 counterparty: transfers/merchants pre-fill, bills stay empty (no sender)** (unexpected)
  - Error: Error: 1779600297906.jpg: import pipeline must reach the confirm form \| expect(received).toBe(expected) // Object.is equality \| Expected: true \| Received: false \|   151 \|   for (const r of rows) {
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/field-2-counterparty-captu-66622-bills-stay-empty-no-sender--chromium/test-failed-1.png
- **honey-visual.spec.ts: light sessions** (unexpected)
  - Error: Error: expect(page).toHaveScreenshot(expected) failed \|   1869 pixels (ratio 0.01 of all image pixels) are different. \|   Snapshot: light-sessions.png \| Call log: \|   - Expect "toHaveScreenshot(light-sessions.png)" with timeout 15000ms
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/honey-visual.spec.ts-snapshots/light-sessions-chromium-win32.png, E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/honey-visual-light-sessions-chromium/light-sessions-actual.png, E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/honey-visual-light-sessions-chromium/light-sessions-diff.png, E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/honey-visual-light-sessions-chromium/test-failed-1.png
- **invest-m1.spec.ts: QA-M1-5 /invest renders in dark theme and in English** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('button', { name: 'Holdings', exact: true }) \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/invest-m1-QA-M1-5-invest-r-c5525-n-dark-theme-and-in-English-chromium/test-failed-1.png
- **invest-m3.spec.ts: QA-M3-1 dashboard totals/cost/P&L, allocation and concentration match the fixture** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByText('93.9%') \| Expected: visible \| Error: strict mode violation: getByText('93.9%') resolved to 3 elements: \|     1) <span class="tabular-nums font-semibold text-destructive">93.9%</span> aka getByText('%').first()
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/invest-m3-QA-M3-1-dashboar-1c58c-entration-match-the-fixture-chromium/test-failed-1.png
- **invest-m3.spec.ts: QA-M3-4 two holding rows of the same asset aggregate before concentration** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByText('61.0%') \| Expected: visible \| Error: strict mode violation: getByText('61.0%') resolved to 3 elements: \|     1) <span class="tabular-nums font-semibold text-destructive">61.0%</span> aka getByText('%').first()
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/invest-m3-QA-M3-4-two-hold-1ab92-regate-before-concentration-chromium/test-failed-1.png
- **invest-m5.spec.ts: QA-M5-8 the Plan tab renders in English and in dark theme, disclaimer intact** (unexpected)
  - Error: Test timeout of 300000ms exceeded. / Error: locator.click: Test timeout of 300000ms exceeded. \| Call log: \|   - waiting for getByRole('button', { name: 'Plan', exact: true }) \|   405 \| \|   406 \|   await page.goto('/invest')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/invest-m5-QA-M5-8-the-Plan-11dad-ark-theme-disclaimer-intact-chromium/test-failed-1.png
- **m1-1-signup-journey.spec.ts: M1-S1 new user signs up and logs first expense › signup → account → expense → listed with updated balance** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('option', { name: 'KBank', exact: true }) \|    at helpers\ui.ts:26 \|   24 \|   } else {
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m1-1-signup-journey-M1-S1--82f7c-listed-with-updated-balance-chromium/test-failed-1.png
- **m1-2-isolation.spec.ts: M1-S2 user B sees none of user A data** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test ended. \| Call log: \|   - waiting for getByRole('option', { name: 'SCB', exact: true }) \|    at helpers\ui.ts:26 \|   24 \|   } else {
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m1-2-isolation-M1-S2-user-B-sees-none-of-user-A-data-chromium/test-failed-1.png
- **m1-3-balance-sync.spec.ts: M1-S3 transfer/balance hand fixture** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('option', { name: 'SCB', exact: true }) \|    at helpers\ui.ts:26 \|   24 \|   } else {
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m1-3-balance-sync-M1-S3-transfer-balance-hand-fixture-chromium/test-failed-1.png
- **m2-s5-accuracy.spec.ts: M2-S5 amount correct on ≥9/12 real slips; counterparty populated where expected (M2-1 + M2-9b)** (unexpected)
  - Error: Error: Amount correct on only 4/12 slips (need ≥9) \| expect(received).toBeGreaterThanOrEqual(expected) \| Expected: >= 9 \| Received:    4 \|   117 \|
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m2-s5-accuracy-M2-S5-amoun-767ca--where-expected-M2-1-M2-9b--chromium/test-failed-1.png
- **m2-slip-import.spec.ts: M2-S1 parsed slip pre-fills confirm form; nothing saves until confirmed** (unexpected)
  - Error: Error: expect(locator).toHaveValue(expected) failed \| Locator:  locator('input[name="amount"]') \| Expected: "1250.00" \| Received: "1,250.00" \| Timeout:  15000ms
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m2-slip-import-M2-S1-parse-8331f-thing-saves-until-confirmed-chromium/test-failed-1.png
- **m3-budgets.spec.ts: M3-S1 budget 10,000 with 7,000 expense + 5,000 transfer → 3,000 remaining** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('button', { name: 'เพิ่มงบประมาณ' }) \|   28 \| async function createMonthOverallBudget(page: Page, baht: string): Promise<void> { \|   29 \|   await page.goto('/budgets')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m3-budgets-M3-S1-budget-10-5867e--transfer-→-3-000-remaining-chromium/test-failed-1.png
- **m3-groups.spec.ts: M3-S3 group total sums expense members only; a transfer member is excluded** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('dialog').getByText('-฿400.00').first().locator('xpath=ancestor::div[contains(@class,"p-3")][1]').getByRole('button') \|   29 \| async function assignCandidate(dialog: ReturnType<Page['getByRole']>, amountText: string): Promise<void> { \|   30 \|   const row = dialog.getByText(amountText).first().locator('xpath=ancestor::div[contains(@class,"p-3")][1]')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m3-groups-M3-S3-group-tota-df702-transfer-member-is-excluded-chromium/test-failed-1.png
- **m3-recurring.spec.ts: M3-S2 deleting a generated occurrence is not recreated on reload** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('button', { name: 'เพิ่มรายการประจำ' }) \|   29 \| async function createWeeklyRule(page: Page, amountBaht: string, startDate: string): Promise<void> { \|   30 \|   await page.goto('/recurring')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m3-recurring-M3-S2-deletin-80960--is-not-recreated-on-reload-chromium/test-failed-1.png
- **m4-guest-pay.spec.ts: M4-S1 host creates session; logged-out guest sees QR and submits a slip; host confirms** (unexpected)
  - Error: Test timeout of 600000ms exceeded. / Error: locator.click: Test ended. \| Call log: \|   - waiting for getByRole('button', { name: 'สร้างรายการ' }) \|   49 \| \|   50 \|   await host.goto('/sessions')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m4-guest-pay-M4-S1-host-cr-c43fd-ubmits-a-slip-host-confirms-chromium/test-failed-1.png
- **m5-settings.spec.ts: M5-S1/S2 settings preferences + dashboard chart › M5-S1 theme + language switch apply app-wide and persist across reload** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('heading', { name: 'ตั้งค่า' }) \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m5-settings-M5-S1-S2-setti-2a008-e-and-persist-across-reload-chromium/test-failed-1.png
- **m5-settings.spec.ts: M5-S1/S2 settings preferences + dashboard chart › M5-S2 dashboard renders the 6-month income/expense chart (lazy Recharts)** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('heading', { name: 'รายรับ/รายจ่าย 6 เดือนล่าสุด' }) \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m5-settings-M5-S1-S2-setti-f4184-xpense-chart-lazy-Recharts--chromium/test-failed-1.png
- **m5-settings.spec.ts: M5-S3 account deletion cascades and signs out › delete account → redirected to login, auth user gone, zero rows remain** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('option', { name: 'KBank', exact: true }) \|    at helpers\ui.ts:26 \|   24 \|   } else {
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m5-settings-M5-S3-account--ec56c--user-gone-zero-rows-remain-chromium/test-failed-1.png
- **m7-dup-override.spec.ts: QA-M7B-1 duplicate ref_code → J2 override saves a new row (not a hard block)** (unexpected)
  - Error: Error: expect(locator).toHaveValue(expected) failed \| Locator:  locator('input[name="amount"]') \| Expected: "1250.00" \| Received: "1,250.00" \| Timeout:  15000ms
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m7-dup-override-QA-M7B-1-d-3c1b9-a-new-row-not-a-hard-block--chromium/test-failed-1.png
- **m7-edit-transaction.spec.ts: QA-M7A-1 create → edit amount + counterparty → change persists on reload** (unexpected)
  - Error: Error: expect(locator).toHaveCount(expected) failed \| Locator:  getByText(/100\.00/) \| Expected: 1 \| Received: 2 \| Timeout:  15000ms
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m7-edit-transaction-QA-M7A-d1841-→-change-persists-on-reload-chromium/test-failed-1.png
- **m7-recurring-deducts.spec.ts: QA-M7D-1 a rule due today deducts exactly once on dashboard load; balance drops; budget counts it** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('button', { name: 'เพิ่มรายการประจำ' }) \|   57 \| async function createMonthlyExpenseRule(page: Page, amountBaht: string, startDate: string): Promise<void> { \|   58 \|   await page.goto('/recurring')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m7-recurring-deducts-QA-M7-23a24-ance-drops-budget-counts-it-chromium/test-failed-1.png
- **m9-home-restructure.spec.ts: M9-home-1 Home has no embedded quick-add; FAB sheet + today list + budget work, and NO chart renders** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('dialog', { name: 'บันทึกรายการ' }).getByLabel('จำนวนเงิน (บาท)') \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m9-home-restructure-M9-hom-fc1a8-t-work-and-NO-chart-renders-chromium/test-failed-1.png
- **m9-home-restructure.spec.ts: OWNER-FB A2 AccountGrid exposes six stable balance tiles and dims the transfer source** (unexpected)
  - Error: Error: expect(received).toContain(expected) // indexOf \| Expected substring: "700.00" \| Received string:    "เงินสด, KBank, ยอด ฿800.00" \| Call Log: \| - Timeout 15000ms exceeded while waiting on the predicate
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m9-home-restructure-OWNER--a4e33-nd-dims-the-transfer-source-chromium/test-failed-1.png
- **m9-onboarding.spec.ts: M9-onboard-1 fresh user: FirstAccountSheet guides the first account, then first log — no dead end** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('option', { name: 'KBank', exact: true }) \|   72 \|   await page.getByLabel('ชื่อบัญชี').fill('เงินสด') \|   73 \|   await page.locator('form').getByRole('combobox').first().click()
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m9-onboarding-M9-onboard-1-8697a-hen-first-log-—-no-dead-end-chromium/test-failed-1.png
- **m9-onboarding.spec.ts: M9-onboard-5 batch import with zero accounts → each card offers inline "+ สร้างบัญชี" (prod build)** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('button', { name: '+ สร้างบัญชี' }).first() \| Expected: visible \| Timeout: 300000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/m9-onboarding-M9-onboard-5-00135-line-สร้างบัญชี-prod-build--chromium/test-failed-1.png
- **ownerfb-a1-slip-queue.spec.ts: OWNER-FB A1 manual fallback saves one failed item and warns before discarding the other** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.fill: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('dialog', { name: 'บันทึกรายการ' }).getByLabel('จำนวนเงิน (บาท)') \|   65 \|   await expect(sheet.getByText('อ่านไม่ได้')).toHaveCount(2, { timeout: 30_000 }) \|   66 \|   await sheet.getByRole('button', { name: 'กรอกเอง' }).first().click()
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/ownerfb-a1-slip-queue-OWNE-09bbe-before-discarding-the-other-chromium/test-failed-1.png
- **review-20261010.spec.ts: QA-INVEST-1 full fractional sale survives reload (with FX)** (unexpected)
  - Error: Test timeout of 240000ms exceeded. / Error: locator.click: Test timeout of 240000ms exceeded. \| Call log: \|   - waiting for getByRole('dialog').locator('form').getByRole('combobox') \|   55 \|     await sheet.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click() \|   56 \|     const form = sheet.locator('form')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/review-20261010-QA-INVEST--bcba0-le-survives-reload-with-FX--chromium/test-failed-1.png
- **review-20261010.spec.ts: QA-INVEST-1 full fractional sale survives reload (missing valuation FX)** (unexpected)
  - Error: Test timeout of 240000ms exceeded. / Error: locator.click: Test timeout of 240000ms exceeded. \| Call log: \|   - waiting for getByRole('dialog').locator('form').getByRole('combobox') \|   55 \|     await sheet.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click() \|   56 \|     const form = sheet.locator('form')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/review-20261010-QA-INVEST--e762f-eload-missing-valuation-FX--chromium/test-failed-1.png
- **review-20261010.spec.ts: QA-INVEST-1 partial, closed missing-FX/null-proxy, and reopened positions reach the real planner** (unexpected)
  - Error: Test timeout of 300000ms exceeded. / Error: locator.click: Test timeout of 300000ms exceeded. \| Call log: \|   - waiting for getByRole('dialog').locator('form').getByRole('combobox') \|   26 \|   await sheet.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click() \|   27 \|   const form = sheet.locator('form')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/review-20261010-QA-INVEST--2680f-ions-reach-the-real-planner-chromium/test-failed-1.png
- **review-20261010.spec.ts: DS-1 keyboard focus appears without a shadow transition** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('button', { name: 'เพิ่มงบประมาณ', exact: true }) \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/review-20261010-DS-1-keybo-7c2d8-without-a-shadow-transition-chromium/test-failed-1.png
- **review-20261010.spec.ts: DS-1 real budget progress scales to 50% and disables motion when requested** (unexpected)
  - Error: Test timeout of 180000ms exceeded. / Error: locator.click: Test timeout of 180000ms exceeded. \| Call log: \|   - waiting for getByRole('button', { name: 'เพิ่มงบประมาณ' }) \|   163 \|   await page.emulateMedia({ reducedMotion: 'no-preference' }) \|   164 \|   await page.goto('/budgets')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/review-20261010-DS-1-real--247e9-ables-motion-when-requested-chromium/test-failed-1.png
- **spec5-optimistic.spec.ts: SPEC5-F6 — optimistic save: provisional row paints subdued & not tappable, balance frozen, then resolves** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.fill: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByLabel('จำนวนเงิน (บาท)') \|   71 \|   await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click() \|   72 \|   await expect(page.getByRole('heading', { name: QUICK_ADD_TITLE })).toBeVisible()
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/spec5-optimistic-SPEC5-F6--3535c-alance-frozen-then-resolves-chromium/test-failed-1.png
- **spec5-optimistic.spec.ts: SPEC5-1 — forced failure: row rolls back, error toast fires, sheet reopens with EVERY field intact (datetime included), balance frozen** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.fill: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByLabel('จำนวนเงิน (บาท)') \|   71 \|   await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click() \|   72 \|   await expect(page.getByRole('heading', { name: QUICK_ADD_TITLE })).toBeVisible()
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/spec5-optimistic-SPEC5-1-—-d3571-ime-included-balance-frozen-chromium/test-failed-1.png
- **spec5-optimistic.spec.ts: SPEC5-scope — editing an existing transaction still BLOCKS (no optimism): sheet stays open on a disabled saving button, no provisional row** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('heading', { name: 'รายการ', exact: true }) \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/spec5-optimistic-SPEC5-sco-233d4-g-button-no-provisional-row-chromium/test-failed-1.png
- **spec5-visual.spec.ts: F2 — sheet amount field has a visible affordance and focal size in light** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('dialog', { name: 'บันทึกรายการ' }).getByLabel('จำนวนเงิน (บาท)').locator('..') \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/spec5-visual-F2-—-sheet-am-6dabb-nce-and-focal-size-in-light-chromium/test-failed-1.png
- **spec5-visual.spec.ts: F2 — sheet amount field has a visible affordance and focal size in dark** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('dialog', { name: 'บันทึกรายการ' }).getByLabel('จำนวนเงิน (บาท)').locator('..') \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/spec5-visual-F2-—-sheet-am-6a4f6-ance-and-focal-size-in-dark-chromium/test-failed-1.png
- **spec5-visual.spec.ts: SPEC5-mobile — mobile viewport (390×844): FAB opens the only add sheet, amount affordance + empty prompt render, no 12px on Home** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.evaluate: Test timeout of 120000ms exceeded. \| Call log: \|   - waiting for getByRole('dialog').getByLabel('จำนวนเงิน (บาท)').locator('..') \|   233 \|   const amount = page.getByRole('dialog').getByLabel('จำนวนเงิน (บาท)') \|   234 \|   const wrapper = amount.locator('xpath=..')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/spec5-visual-SPEC5-mobile--15e48-ompt-render-no-12px-on-Home-chromium/test-failed-1.png
- **trip-1-create-share.spec.ts: TRIP-1 trip create hides account/QR/target; share card shows the absolute URL** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test ended. \| Call log: \|   - waiting for getByRole('button', { name: 'สร้างรายการ' }) \|   30 \| \|   31 \|   await page.goto('/sessions')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/trip-1-create-share-TRIP-1-f5860-card-shows-the-absolute-URL-chromium/test-failed-1.png
- **trip-5-owner.spec.ts: TRIP-5 owner acts in-app (add / send / confirm) then close-gates anon, reopen, delete** (unexpected)
  - Error: Error: expect(locator).toBeVisible() failed \| Locator: getByRole('button', { name: 'สร้างรายการ' }) \| Expected: visible \| Timeout: 15000ms \| Error: element(s) not found
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/trip-5-owner-TRIP-5-owner--509f3-se-gates-anon-reopen-delete-chromium/test-failed-1.png
- **trip-7-regression-ux.spec.ts: TRIP-7 create dialog: required asterisks present, no optional text (collect + trip)** (unexpected)
  - Error: Test timeout of 120000ms exceeded. / Error: locator.click: Test ended. \| Call log: \|   - waiting for getByRole('button', { name: 'สร้างรายการ' }) \|   15 \|   const page = await ctx.newPage() \|   16 \|   await page.goto('/sessions')
  - Screenshot: E:/claudeWorkSpace/project/jodsa/tests/e2e/evidence/qa-regression-2026-10-30/full-final/failures/trip-7-regression-ux-TRIP--1a819-optional-text-collect-trip--chromium/test-failed-1.png

## Skips

- **honey-visual.spec.ts: light more** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: light settings** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: light add manual, transfer, and slip surfaces** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark home** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark transactions** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark accounts** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark budgets** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark invest** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark recurring** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark groups** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark import** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark sessions** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark more** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark settings** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: dark add manual, transfer, and slip surfaces** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: signed-out auth surfaces › light login** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: signed-out auth surfaces › light signup** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: signed-out auth surfaces › dark login** — Serial suite stopped after failure: light sessions
- **honey-visual.spec.ts: signed-out auth surfaces › dark signup** — Serial suite stopped after failure: light sessions
- **m1-3-balance-sync.spec.ts: M1-S4 second device sees the same data after load** — Serial suite stopped after failure: M1-S3 transfer/balance hand fixture
- **m2-slip-import.spec.ts: M2-S2 no request carries image bytes during the whole import flow** — Serial suite stopped after failure: M2-S1 parsed slip pre-fills confirm form; nothing saves until confirmed
- **m2-slip-import.spec.ts: M2-S3 re-importing the same readable-QR slip is rejected** — Serial suite stopped after failure: M2-S1 parsed slip pre-fills confirm form; nothing saves until confirmed
- **m2-slip-import.spec.ts: M2-S4 null-ref near-duplicate triggers soft warning (cancel and proceed)** — Serial suite stopped after failure: M2-S1 parsed slip pre-fills confirm form; nothing saves until confirmed
- **m4-guest-pay.spec.ts: M4-S2 guest POST past the rate limit is throttled (429)** — Serial suite stopped after failure: M4-S1 host creates session; logged-out guest sees QR and submits a slip; host confirms
- **m4-guest-pay.spec.ts: M4-S4 a different anon client cannot read the session slips (RLS read-deny)** — Serial suite stopped after failure: M4-S1 host creates session; logged-out guest sees QR and submits a slip; host confirms
- **m4-guest-pay.spec.ts: M4-S3 closed session: guest POST rejected and page shows unavailable** — Serial suite stopped after failure: M4-S1 host creates session; logged-out guest sees QR and submits a slip; host confirms
- **m7-recurring-deducts.spec.ts: QA-M7D-2 a rule due later this month does NOT deduct early (≤-today clamp)** — too close to month-end to place a due-later date this month; too close to month-end to place a due-later date this month
- **ownerfb-a1-slip-queue.spec.ts: OWNER-FB A1 /transactions uses the same global add sheet** — Serial suite stopped after failure: OWNER-FB A1 manual fallback saves one failed item and warns before discarding the other
