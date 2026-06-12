import { test, expect } from '@playwright/test'
import {
  adminClient, ensureConfirmedUser, deleteUserByEmail, resetAllUserData,
} from './helpers/admin'
import { login, createAccount, addTransaction } from './helpers/ui'

/**
 * M5-S1 — language + theme toggle update the whole app and persist.
 * M5-S2 — dashboard income/expense chart renders (lazy Recharts chunk).
 * M5-S3 — account deletion cascades all rows and signs the user out.
 */

const PASSWORD = 'QaPolish123!'

test.describe('M5-S1/S2 settings preferences + dashboard chart', () => {
  const email = `qa-m5-prefs-${Date.now()}@jodsa.test`

  test.beforeAll(async () => {
    const userId = await ensureConfirmedUser(email, PASSWORD, 'QA Polish')
    await resetAllUserData(userId)
  })

  test.afterAll(async () => {
    await deleteUserByEmail(email)
  })

  test('M5-S1 theme + language switch apply app-wide and persist across reload', async ({ page }) => {
    await login(page, email, PASSWORD)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'ตั้งค่า' })).toBeVisible()

    // Theme: ตามระบบ → มืด — <html> gains the dark class and it survives reload
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'มืด' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Language: ไทย → English — nav, settings, and other screens re-render in English
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: 'English' }).click()
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Transaction' })).toBeVisible()

    // Switch back to Thai for good measure (cookie-based, same tab)
    await page.goto('/settings')
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: 'ไทย' }).click()
    await expect(page.getByRole('link', { name: 'ภาพรวม' })).toBeVisible({ timeout: 15_000 })
  })

  test('M5-S2 dashboard renders the 6-month income/expense chart (lazy Recharts)', async ({ page }) => {
    await login(page, email, PASSWORD)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'รายรับ/รายจ่าย 6 เดือนล่าสุด' })).toBeVisible()
    // Recharts mounts client-side after the lazy chunk loads
    await expect(page.locator('.recharts-responsive-container')).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('M5-S3 account deletion cascades and signs out', () => {
  const email = `qa-m5-del-${Date.now()}@jodsa.test`
  let userId: string

  test.afterAll(async () => {
    await deleteUserByEmail(email) // no-op when the test already deleted the user
  })

  test('delete account → redirected to login, auth user gone, zero rows remain', async ({ page }) => {
    userId = await ensureConfirmedUser(email, PASSWORD, 'QA Doomed')
    await login(page, email, PASSWORD)
    await createAccount(page, 'Doomed Wallet', 'KBank')
    await addTransaction(page, { type: 'expense', amount: '99', account: 'Doomed Wallet' })

    await page.goto('/settings')
    page.on('dialog', (dialog) => dialog.accept()) // two confirm() prompts
    await page.getByRole('button', { name: 'ลบบัญชีผู้ใช้' }).click()
    await page.waitForURL('**/login', { timeout: 30_000 })

    // Cascade can only be asserted at the DB level — the user no longer exists
    // to query through the UI. Admin client is sanctioned for test assertions
    // of destructive teardown like this.
    const a = adminClient()
    const { data: users } = await a.auth.admin.listUsers({ page: 1, perPage: 1000 })
    expect(users.users.find((u) => u.email === email)).toBeUndefined()

    for (const table of ['accounts', 'transactions', 'budgets', 'groups', 'recurring_rules'] as const) {
      const { count, error } = await a
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
      expect(error).toBeNull()
      expect(count).toBe(0)
    }
  })
})
