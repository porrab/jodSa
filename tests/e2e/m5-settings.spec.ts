import { test, expect } from '@playwright/test'
import {
  resetAllUserData, seedAccount, findUserByEmail,
} from './helpers/admin'
import { env } from './helpers/env'
import { login } from './helpers/ui'

/**
 * M5-S1 — language + theme toggle update the whole app and persist.
 * M5-S2 — six-month income/expense chart renders on Budgets overview (lazy Recharts chunk).
 * M5-S3 — account deletion cascades all rows and signs the user out.
 */

test.describe('M5-S1/S2 settings preferences + dashboard chart', () => {
  let userId: string

  test.beforeAll(async () => {
    const user = await findUserByEmail(env.userB.email)
    if (!user) throw new Error('test user B missing')
    userId = user.id
    await resetAllUserData(userId)
    await seedAccount(userId, 'QA Polish Wallet', 'KBank')
  })

  test.afterAll(async () => {
    await resetAllUserData(userId)
  })

  test('M5-S1 theme + language switch apply app-wide and persist across reload', async ({ page }) => {
    await login(page, env.userB.email, env.userB.password)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'ตั้งค่า' })).toBeVisible()

    // Theme: ตามระบบ → มืด — <html> gains the dark class and it survives reload
    await page.getByRole('button', { name: 'มืด', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Language: ไทย → English — nav, settings, and other screens re-render in English
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible()

    // Switch back to Thai for good measure (cookie-based, same tab)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'ไทย', exact: true }).click()
    await expect(page.getByRole('link', { name: 'หน้าหลัก' })).toBeVisible({ timeout: 15_000 })
  })

  test('M5-S2 Budgets overview renders the 6-month income/expense chart (lazy Recharts)', async ({ page }) => {
    await login(page, env.userB.email, env.userB.password)
    await page.goto('/budgets')
    await page.getByRole('tab', { name: 'ภาพรวม', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'รายรับ/รายจ่าย 6 เดือนล่าสุด' })).toBeVisible()
    // Recharts mounts client-side after the lazy chunk loads
    await expect(page.locator('.recharts-responsive-container')).toBeVisible({ timeout: 20_000 })
  })
})

test.skip('M5-S3 account deletion cascades and signs out — requires a disposable identity beyond allowed A/B', async () => {
  // This destructive auth test cannot run under the A/B-only account boundary.
})
