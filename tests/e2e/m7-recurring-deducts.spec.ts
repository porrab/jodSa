import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount, seedBudget } from './helpers/admin'

/**
 * QA-M7 (crux) — Recurring rules ACTUALLY DEDUCT (M7-D / design J7).
 *
 * Reproduces the persistent field report "ตั้งรายการประจำแล้วแต่ไม่หักจริง" as a
 * behavioral proof: a user creates a recurring rule through the real form, opens
 * the app, and the money is deducted — exactly once, on the due date, counted by
 * the balance and the budget; a rule due LATER this month does NOT deduct early
 * (the ≤-today clamp).
 *
 * MUST run against a PRODUCTION server (`pnpm build && pnpm start`), not `pnpm dev`
 * — the field bug is a prod symptom and a dev-mode pass does not close it. This
 * spec is server-behavior-only (no OCR), so it exercises the exact
 * materialize-on-page-load path that failed in the field.
 *
 * Amounts use unique satang-precise values so a text search pins the one row the
 * rule produced. The date math itself is unit-covered (recurrence.test.ts /
 * range.test.ts / materialize.test.ts); this spec proves the on-read integration.
 */

const ACCT = 'QA-M7D บัญชีประจำ'
const DUE_TODAY_AMOUNT = '137' // ฿137.00 — the due-today rule
const DUE_LATER_AMOUNT = '259' // ฿259.00 — the due-later rule (must NOT deduct early)
const BUDGET_SATANG = 1_000_000 // ฿10,000.00 overall month budget

test.use({ storageState: STORAGE_A })

/** Bangkok calendar date (YYYY-MM-DD) — the same basis the app clamps to. */
function todayBangkok(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** A date strictly after today but still inside the current Bangkok month, or null
 *  if today is too close to month-end to have one. */
function laterThisMonth(): string | null {
  const today = todayBangkok()
  const [y, m, d] = today.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const target = d + 5
  if (target > lastDay) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(target).padStart(2, '0')}`
}

async function resetAndSeed(): Promise<void> {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetAllUserData(user.id)
  await seedAccount(user.id, ACCT, 'SCB') // becomes accounts[0] → default in the rule form
  await seedBudget(user.id, BUDGET_SATANG) // overall month budget for the "counts it" check
}

/** Create a monthly expense rule through the real recurring form (freq defaults to
 *  monthly; type to expense; account to accounts[0]). */
async function createMonthlyExpenseRule(page: Page, amountBaht: string, startDate: string): Promise<void> {
  await page.goto('/recurring')
  await page.getByRole('button', { name: 'เพิ่มรายการประจำ' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill(amountBaht)
  await dialog.getByLabel('วันเริ่ม').fill(startDate)
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(dialog).toBeHidden()
}

test('QA-M7D-1 a rule due today deducts exactly once on dashboard load; balance drops; budget counts it', async ({ page }) => {
  await resetAndSeed()
  const today = todayBangkok()
  await createMonthlyExpenseRule(page, DUE_TODAY_AMOUNT, today)

  // Open the dashboard as the user would after setting the rule. Lazy-on-read
  // materialization must have created the occurrence and moved the money.
  await page.goto('/dashboard')

  // Balance dropped: the only expense this month is the materialized occurrence,
  // so ฿137.00 surfaces on the dashboard (month-expense + the account balance).
  await expect(page.getByText(/137\.00/).first()).toBeVisible()
  // Budget counts it: overall 10,000 − 137 = 9,863 remaining.
  await expect(page.getByText('เหลือ ฿9,863.00')).toBeVisible()

  // Exactly one occurrence row — idempotent, not the whole month, not duplicated.
  await page.goto('/transactions')
  await expect(page.getByText(/137\.00/)).toHaveCount(1)
  // …and it carries the recurring provenance badge (came from the rule, not manual).
  await expect(page.getByText('🔁')).toHaveCount(1)

  // J7 "did it work?" — the recurring page reports it deducted today, no error state.
  await page.goto('/recurring')
  await expect(page.getByText(`หักล่าสุด: ${today}`)).toBeVisible()
  await expect(page.getByText('หักเงินรอบนี้ไม่สำเร็จ')).toHaveCount(0)

  // Reload the dashboard — materialization is idempotent, still exactly one row.
  await page.goto('/dashboard')
  await page.goto('/transactions')
  await expect(page.getByText(/137\.00/)).toHaveCount(1)
})

test('QA-M7D-2 a rule due later this month does NOT deduct early (≤-today clamp)', async ({ page }) => {
  const later = laterThisMonth()
  test.skip(later === null, 'too close to month-end to place a due-later date this month')

  await resetAndSeed()
  await createMonthlyExpenseRule(page, DUE_LATER_AMOUNT, later!)

  // Open the dashboard: the future occurrence must NOT be materialized yet.
  await page.goto('/dashboard')
  await expect(page.getByText(/259\.00/)).toHaveCount(0) // no early deduction anywhere on the dashboard
  await expect(page.getByText('เหลือ ฿10,000.00')).toBeVisible() // budget untouched

  await page.goto('/transactions')
  await expect(page.getByText(/259\.00/)).toHaveCount(0) // zero occurrence rows

  // J7: the recurring page shows it has never deducted and names the future due date.
  await page.goto('/recurring')
  await expect(page.getByText('หักล่าสุด: ยังไม่เคย')).toBeVisible()
  await expect(page.getByText(`ครั้งถัดไป: ${later}`)).toBeVisible()
})
