import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount, seedBudget, seedTransaction } from './helpers/admin'

/**
 * QA-M9 — Home restructure (design v3 J1/J6), production build.
 *
 * Behavioral proof of two acceptance criteria:
 *  - Home (/dashboard) shows quick-add + today's transactions + a one-line budget,
 *    and renders NO chart (the 6-month chart nobody read is gone from the first
 *    screen). Asserted by the ABSENCE of any Recharts DOM on /dashboard.
 *  - The 6-month chart renders under งบ → ภาพรวม (lazy). Asserted by Recharts DOM
 *    appearing only after the ภาพรวม tab is opened.
 */

test.use({ storageState: STORAGE_A })

let userId: string

test.beforeAll(async () => {
  const u = await findUserByEmail(env.userA.email)
  if (!u) throw new Error(`test user A missing: ${env.userA.email}`)
  userId = u.id
  await resetAllUserData(userId)
  const acct = await seedAccount(userId, 'เงินสด', 'KBank')
  await seedBudget(userId, 1_000_000) // ฿10,000 overall month budget
  await seedTransaction(userId, acct, { type: 'expense', amountSatang: 50_000, category: 'food' }) // ฿500 today
})

test('M9-home-1 Home shows quick-add + today list + one-line budget, and NO chart renders', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  // Focal balance + quick-add block.
  await expect(page.getByLabel('จำนวนเงิน')).toBeVisible() // quick-add amount input
  await expect(page.getByRole('link', { name: 'สแกนสลิป' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'บันทึก', exact: true })).toBeVisible()

  // One-line budget status (plain text, links to งบ): expense ฿500, remaining ฿9,500.
  // Glyph-robust: assert the Thai labels + the numeric substrings separately.
  await expect(page.getByText('เดือนนี้ใช้ไป', { exact: false })).toBeVisible()
  await expect(page.getByText('งบเหลือ', { exact: false })).toBeVisible()
  await expect(page.locator('body')).toContainText('500.00')
  await expect(page.locator('body')).toContainText('9,500.00')

  // Today's transactions section present with the seeded item.
  await expect(page.getByText('รายการวันนี้', { exact: false })).toBeVisible()
  await expect(page.locator('body')).toContainText('500.00')

  // NO chart on Home — this is the acceptance criterion. No Recharts DOM at all,
  // and the 6-month chart heading is absent from /dashboard.
  await expect(page.locator('[class*="recharts"]')).toHaveCount(0)
  await expect(page.getByText('รายรับ/รายจ่าย 6 เดือนล่าสุด')).toHaveCount(0)
  await expect(page.locator('svg.recharts-surface')).toHaveCount(0)
})

test('M9-home-2 the 6-month chart renders under งบ → ภาพรวม (lazy), not before', async ({ page }) => {
  await page.goto('/budgets')
  await page.waitForLoadState('networkidle')

  // Default tab is งบประมาณ (budget bars) — no chart yet.
  await expect(page.getByRole('button', { name: 'ภาพรวม', exact: true })).toBeVisible()
  await expect(page.locator('[class*="recharts"]')).toHaveCount(0)

  // Open ภาพรวม → the lazy chart chunk mounts and Recharts DOM appears.
  await page.getByRole('button', { name: 'ภาพรวม', exact: true }).click()
  await expect(page.getByText('รายรับ/รายจ่าย 6 เดือนล่าสุด')).toBeVisible()
  await expect(page.locator('[class*="recharts"]').first()).toBeVisible({ timeout: 30_000 })
})
