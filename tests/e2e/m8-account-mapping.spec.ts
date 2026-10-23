import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

/**
 * QA-M8 — Smart Account Mapping (M8) behavioral E2E.
 *
 * Proves the confirm-form account precedence and the live learning loop on a
 * PRODUCTION build (the import/OCR path has a prod-only hydration race — dev mode
 * does NOT prove it; see importSlip below). RLS/precedence unit logic is covered
 * separately (tests/unit/rls.test.ts + account-map/last-account unit suites);
 * this file exercises the user-visible outcome end to end against live Supabase.
 *
 * Precedence under test (lib/last-account.ts resolveAccountDefault):
 *   learned fingerprint > number_hint > app signature > bank code > per-category
 *   > global last > first account.
 *
 * Seeding discipline (so each scenario proves ITS tier, never a false GREEN):
 *   - The account a lower tier WOULD pick is seeded FIRST (accounts[0]), so if the
 *     tier under test does not fire, the wrong account is selected and the test
 *     fails — the target account can only win via the tier being tested.
 *
 * Order-independence (heeds QA-M7-H1): every test resets + seeds its own accounts
 * in-body, so a consolidated run is not order-flaky. resetUserData deletes the
 * user's accounts, which cascades slip_account_map (FK account_id ON DELETE
 * CASCADE, migration 0007) — so learned mappings from a prior test never leak in.
 */

const CORPUS = path.resolve('E:/claudeWorkSpace/qa-lab/projects/jodsa/corpus')
// Paotang wallet slip — detectSourceApp() fires 'paotang' on the `G-Wallet ID/!0:`
// anchor (corpus-verified). Same file the FIELD-2 guard uses (reaches confirm form).
const PAOTANG = path.join(CORPUS, 'PaoTang_2026_06_07 18_39_32.png')
// KBank make slip — real OCR sender mask "xxx-x-x5357-x" → senderMask "5357"
// (tests/unit/extract.test.ts). No literal MAKE brand text in the corpus, so
// detectSourceApp returns null here — the make-vs-Kbank disambiguation rides on
// number_hint (pm-desk M8 ruling), which is exactly what QA-M8-2 seeds + proves.
const MAKE = path.join(CORPUS, 'Image_12b1db54-2951-4d62-8c9b-19302103cafe.jpeg')
// KTB transfer slip — sender mask "441-5", no source-app signature → fingerprint
// "ktb||441-5" carries signal, so the learning loop can key on it (QA-M8-3).
const KTB = path.join(CORPUS, '1779533670088.jpg')

test.use({ storageState: STORAGE_A })

let userId: string

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  userId = user.id
})

/**
 * Hardened prod-build import helper (carried from QA-M7). On the prod bundle the
 * dropzone's onChange attaches a beat after the input exists; firing setInputFiles
 * too early loses the change event and the page sits at idle. Wait for the
 * dropzone, give hydration a moment, fire, and retry once if the first event was
 * still lost to the race. Then wait for the confirm form (OCR is slow first time).
 */
async function importSlip(page: Page, fixture: string): Promise<void> {
  await page.goto('/import')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('วางภาพสลิปที่นี่')).toBeVisible()
  const input = page.locator('input[type="file"]')
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.waitForTimeout(1000)
    await input.setInputFiles(fixture)
    const leftIdle = await page
      .getByText('วางภาพสลิปที่นี่')
      .waitFor({ state: 'hidden', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (leftIdle) break
  }
  await expect(page.getByRole('heading', { name: 'ยืนยันรายการ' })).toBeVisible({ timeout: 240_000 })
}

// DS-3 moved category before the AccountGrid. Target the accessible grid by
// name so field order can change without making this precedence suite brittle.
const accountGrid = (page: Page) => page.locator('form').getByRole('radiogroup', { name: 'บัญชี' })
const accountRadio = (page: Page, name: string) =>
  accountGrid(page).getByRole('radio', { name: new RegExp(`^${name},`) })
// The "เลือกจากสลิป" (matchedFromSlip) badge — shown only when the account came
// from a slip signal AND the user has not manually overridden it. Lives in the
// account Label inside the form.
const slipHint = (page: Page) => page.locator('form').getByText('เลือกจากสลิป')
const confirmButton = (page: Page) => page.getByRole('button', { name: 'ยืนยันและบันทึก' })

test('QA-M8-1 Paotang slip auto-selects the Paotang account (app signature beats sibling KTB); hint shows; override clears hint', async ({ page }) => {
  test.setTimeout(600_000)
  await resetUserData(userId)
  // 3 KTB accounts — the real multi-KTB setup. krungthai FIRST so bank-code AND
  // fallback would both pick it; only the app-signature tier (account NAME contains
  // "paotang") can pick "Paotang" over its same-bank siblings.
  await seedAccount(userId, 'krungthai', 'KTB')
  await seedAccount(userId, 'Paotang', 'KTB')
  await seedAccount(userId, 'Mrt', 'KTB')

  await importSlip(page, PAOTANG)

  // Auto-selected the Paotang account, not another KTB account.
  await expect(accountRadio(page, 'Paotang')).toHaveAttribute('aria-checked', 'true')
  await expect(accountRadio(page, 'krungthai')).toHaveAttribute('aria-checked', 'false')
  // "เลือกจากสลิป" hint present because it was auto-matched and untouched.
  await expect(slipHint(page)).toBeVisible()

  // Manual override → the hint must disappear (shows only when untouched).
  await accountRadio(page, 'krungthai').click()
  await expect(accountRadio(page, 'krungthai')).toHaveAttribute('aria-checked', 'true')
  await expect(slipHint(page)).toBeHidden()
})

test('QA-M8-2 MAKE slip auto-selects the make account via number_hint (not Kbank บัตร); hint shows', async ({ page }) => {
  test.setTimeout(600_000)
  await resetUserData(userId)
  // 2 KBank accounts — the real make / Kbank บัตร pair. "Kbank บัตร" FIRST so
  // bank-code would pick it; only the number_hint tier (make's เลขท้ายบัญชี "5357"
  // ↔ the slip's sender mask "5357") can pick make. detectSourceApp is null for
  // the real make slip, so this genuinely exercises the number_hint path.
  await seedAccount(userId, 'Kbank บัตร', 'KBank')
  await seedAccount(userId, 'make', 'KBank', '5357')

  await importSlip(page, MAKE)

  await expect(accountRadio(page, 'make')).toHaveAttribute('aria-checked', 'true')
  await expect(accountRadio(page, 'Kbank บัตร')).toHaveAttribute('aria-checked', 'false')
  await expect(slipHint(page)).toBeVisible()
})

test('QA-M8-3 correct the account once → next same-fingerprint slip auto-selects the corrected account (live learning loop)', async ({ page }) => {
  test.setTimeout(600_000)
  await resetUserData(userId)
  await seedAccount(userId, 'KTB-Alpha', 'KTB')
  await seedAccount(userId, 'KTB-Beta', 'KTB')

  // First import: no learned mapping / number_hint / app signature → bank-code
  // tier picks the FIRST KTB account (KTB-Alpha).
  await importSlip(page, KTB)
  await expect(accountRadio(page, 'KTB-Alpha')).toHaveAttribute('aria-checked', 'true')

  // Correct to KTB-Beta and SAVE → recordSlipAccountMapping upserts
  // fingerprint("ktb||441-5") → KTB-Beta into slip_account_map (live DB round-trip).
  await accountRadio(page, 'KTB-Beta').click()
  await expect(accountRadio(page, 'KTB-Beta')).toHaveAttribute('aria-checked', 'true')
  await confirmButton(page).click()
  await page.waitForURL('**/transactions', { timeout: 30_000 })

  // Re-import the SAME slip (same fingerprint) → the learned tier now outranks the
  // bank-code default and auto-selects the corrected account, KTB-Beta.
  await importSlip(page, KTB)
  await expect(accountRadio(page, 'KTB-Beta')).toHaveAttribute('aria-checked', 'true')
  // Learned selection is a from-slip signal → the hint shows.
  await expect(slipHint(page)).toBeVisible()
})
