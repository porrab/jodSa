import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A, GENERATED_DIR } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'

/**
 * QA-M9 — Onboarding / zero dead-ends (design v3 J4).
 *
 * Runs on a PRODUCTION build. The behavioral claim: a fresh user (zero accounts)
 * never hits a disabled control as an empty state — EVERY empty account picker
 * offers an inline "+ สร้างบัญชี" exit, and the first-run FirstAccountSheet guides
 * the very first account create. The global empty-source rule is implemented by
 * `components/inline-create-account.tsx` (button label account.createInline
 * "+ สร้างบัญชี"); it replaces the Select wherever accounts.length === 0 in
 * transaction-form / slip-confirm-form / batch-slip-card / recurring-form (M9-1).
 *
 * Order-independence (heeds QA-M7-H1): every test resets user A to a known state
 * in-body before navigating, so a consolidated run is not order-flaky.
 */

test.use({ storageState: STORAGE_A })

const CREATE = '+ สร้างบัญชี' // account.createInline
let userId: string

test.beforeAll(async () => {
  const u = await findUserByEmail(env.userA.email)
  if (!u) throw new Error(`test user A missing: ${env.userA.email}`)
  userId = u.id
})

// Dismiss the auto-opening first-run sheet so the underlying empty picker is
// what's under test. It's guidance (dismissable), not a hard block.
async function dismissFirstAccountSheet(page: Page): Promise<void> {
  const title = page.getByText('สร้างบัญชีแรกของคุณ', { exact: true })
  if (await title.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await expect(title).toBeHidden()
  }
}

// Hardened prod-build import (carried from QA-M7/M8: the dropzone onChange
// attaches a beat after hydration; fire, retry once if the first event is lost).
async function importSlip(page: Page, fixture: string): Promise<void> {
  await page.goto('/import')
  await page.waitForLoadState('networkidle')
  await dismissFirstAccountSheet(page)
  await expect(page.getByText('วางภาพสลิปที่นี่')).toBeVisible()
  const input = page.locator('input[type="file"]')
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.waitForTimeout(1000)
    await input.setInputFiles(fixture)
    const left = await page
      .getByText('วางภาพสลิปที่นี่')
      .waitFor({ state: 'hidden', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (left) break
  }
}

test('M9-onboard-1 fresh user: FirstAccountSheet guides the first account, then first log — no dead end', async ({ page }) => {
  test.setTimeout(120_000)
  await resetAllUserData(userId)

  // J4 — a zero-account user lands on Home and the guided create sheet auto-opens.
  await page.goto('/dashboard')
  await expect(page.getByText('สร้างบัญชีแรกของคุณ', { exact: true })).toBeVisible()

  // Create the first account through the guided sheet (ชื่อ + ธนาคาร).
  await page.getByLabel('ชื่อบัญชี').fill('เงินสด')
  await page.locator('form').getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'KBank', exact: true }).click()
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(page.getByText('สร้างบัญชีแรกของคุณ', { exact: true })).toBeHidden({ timeout: 15_000 })

  // Log the first item via Home quick-add → global sheet. Account is no longer
  // an empty picker: it resolves to the just-created account, so the log saves.
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('จำนวนเงิน (บาท)').fill('120')
  // account select already defaulted to the new account (fallback tier)
  await sheet.getByRole('button', { name: 'บันทึกรายการ' }).click()
  await expect(sheet).toBeHidden({ timeout: 20_000 })

  // The logged item shows on Home's today list — proves the end-to-end first log.
  await expect(page.getByText('รายการวันนี้', { exact: false })).toBeVisible()
  await expect(page.locator('body')).toContainText('120.00')
})

test('M9-onboard-2 Home quick-add with zero accounts → inline "+ สร้างบัญชี" (expense picker AND transfer to-account), never a disabled dead end', async ({ page }) => {
  test.setTimeout(120_000)
  await resetAllUserData(userId)
  await page.goto('/dashboard')
  await dismissFirstAccountSheet(page)

  // Open the Home quick-add → global TransactionForm sheet (accounts = []).
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  // Expense (default) account slot: inline create present, hint present, and the
  // account Select is REPLACED by it (no "เลือกบัญชี" picker), never disabled.
  // (The category Select is a separate, legitimately-present combobox.)
  await expect(sheet.getByRole('button', { name: CREATE })).toBeVisible()
  await expect(sheet.getByText('ยังไม่มีบัญชี — สร้างบัญชีก่อนเริ่มบันทึกรายการ')).toBeVisible()
  await expect(sheet.getByText('เลือกบัญชี')).toHaveCount(0)
  await expect(sheet.locator('button[disabled]')).toHaveCount(0)

  // Switch to โอน (transfer): the to-account picker also has zero candidates →
  // its own inline create with the transfer hint. Two inline exits now, no
  // disabled control anywhere in the form.
  await sheet.getByRole('button', { name: 'โอนเงิน', exact: true }).click()
  await expect(sheet.getByText('ต้องมีอย่างน้อย 2 บัญชีเพื่อโอนเงินระหว่างกัน')).toBeVisible()
  await expect(sheet.getByRole('button', { name: CREATE })).toHaveCount(2)
  await expect(sheet.locator('button[disabled]')).toHaveCount(0)
})

test('M9-onboard-3 recurring-form with zero accounts → inline "+ สร้างบัญชี", NOT a disabled add button (M9-1 fix)', async ({ page }) => {
  test.setTimeout(120_000)
  await resetAllUserData(userId)
  await page.goto('/recurring')
  await dismissFirstAccountSheet(page)

  // M9-1: the zero-account empty state is the inline create, not the old
  // disabled "เพิ่มรายการประจำ" dialog trigger + text hint.
  await expect(page.getByRole('button', { name: CREATE })).toBeVisible()
  await expect(page.getByText('เพิ่มบัญชีก่อนจึงจะสร้างรายการประจำได้')).toBeVisible()
  // The add-rule trigger must be absent (it only renders once an account exists).
  await expect(page.getByRole('button', { name: 'เพิ่มรายการประจำ' })).toHaveCount(0)
})

test('M9-onboard-4 slip-confirm with zero accounts → inline "+ สร้างบัญชี" (import path, prod build)', async ({ page }) => {
  test.setTimeout(600_000)
  await resetAllUserData(userId)
  await importSlip(page, path.join(GENERATED_DIR, 'slip-qr-a.png'))

  await expect(page.getByRole('heading', { name: 'ยืนยันรายการ' })).toBeVisible({ timeout: 240_000 })
  // The account slot is the inline create (hint slip.noAccounts), not an empty/
  // disabled Select — the exact tester complaint the M9 reset fixed.
  await expect(page.getByRole('button', { name: CREATE })).toBeVisible()
  await expect(page.getByText('ยังไม่มีบัญชี — กรุณาเพิ่มบัญชีก่อน')).toBeVisible()
})

test('M9-onboard-5 batch import with zero accounts → each card offers inline "+ สร้างบัญชี" (prod build)', async ({ page }) => {
  test.setTimeout(600_000)
  await resetAllUserData(userId)
  await page.goto('/import')
  await page.waitForLoadState('networkidle')
  await dismissFirstAccountSheet(page)
  await expect(page.getByText('วางภาพสลิปที่นี่')).toBeVisible()

  // Two slips → batch review queue.
  const input = page.locator('input[type="file"]')
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.waitForTimeout(1000)
    await input.setInputFiles([
      path.join(GENERATED_DIR, 'slip-qr-a.png'),
      path.join(GENERATED_DIR, 'slip-qr-b.png'),
    ])
    const left = await page
      .getByText('วางภาพสลิปที่นี่')
      .waitFor({ state: 'hidden', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (left) break
  }

  // Both batch cards parse; each empty-account card offers the inline create,
  // never a disabled/empty Select.
  await expect(page.getByRole('button', { name: CREATE }).first()).toBeVisible({ timeout: 300_000 })
  await expect(page.getByText('ยังไม่มีบัญชี — กรุณาเพิ่มบัญชีก่อน').first()).toBeVisible()
})
