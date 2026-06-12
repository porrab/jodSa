import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'
import { addTransaction } from './helpers/ui'

/**
 * M3-S1 — Budgets count expenses only; a transfer must NOT reduce the remaining.
 * Maps to M3-AC3 (budget over/under correct and excludes transfers).
 *
 * The arithmetic is unit-covered (budget.test.ts is handed a pre-filtered array);
 * this spec proves the real stack — the page query actually filters type='expense'
 * before the transfer ever reaches budgetStatus, and the card renders the result.
 */

const ACCT_X = 'QA-M3 บัญชี X'
const ACCT_Y = 'QA-M3 บัญชี Y'

test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetAllUserData(user.id)
  await seedAccount(user.id, ACCT_X, 'SCB')
  await seedAccount(user.id, ACCT_Y, 'KBank') // transfer destination
})

async function createMonthOverallBudget(page: Page, baht: string): Promise<void> {
  await page.goto('/budgets')
  await page.getByRole('button', { name: 'เพิ่มงบประมาณ' }).click()
  const dialog = page.getByRole('dialog')
  // period defaults to รายเดือน (month), scope to ทั้งหมด (overall) — leave both
  await dialog.getByLabel('งบประมาณ (บาท)').fill(baht)
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(dialog).toBeHidden()
}

test('M3-S1 budget 10,000 with 7,000 expense + 5,000 transfer → 3,000 remaining', async ({ page }) => {
  await createMonthOverallBudget(page, '10000')

  await addTransaction(page, { type: 'expense', amount: '3000', account: ACCT_X })
  await addTransaction(page, { type: 'expense', amount: '4000', account: ACCT_X })
  await addTransaction(page, { type: 'transfer', amount: '5000', account: ACCT_X, toAccount: ACCT_Y })

  await page.goto('/budgets')
  // spent reflects only the two expenses; the 5,000 transfer is excluded
  await expect(page.getByText('฿7,000.00 / ฿10,000.00')).toBeVisible()
  await expect(page.getByText('เหลือ ฿3,000.00')).toBeVisible()
  // if the transfer had leaked in, spent would be 12,000 → over-budget label
  await expect(page.getByText(/เกินงบ/)).toHaveCount(0)
})
