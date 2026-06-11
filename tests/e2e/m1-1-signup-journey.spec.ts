import { test, expect } from '@playwright/test'
import { ensureConfirmedUser, deleteUserByEmail } from './helpers/admin'
import { login, createAccount, addTransaction } from './helpers/ui'

/**
 * M1-S1 — new-user journey: signup → first account → first expense → visible in list + balance.
 * M1-S5 — auth guard: logged-out visitor is redirected to /login.
 */

const PASSWORD = 'QaNewbie123!'
const throwawayEmail = `qa-s1-${Date.now()}@jodsa.test`

test.describe('M1-S1 new user signs up and logs first expense', () => {
  test.afterAll(async () => {
    await deleteUserByEmail(throwawayEmail)
  })

  test('signup → account → expense → listed with updated balance', async ({ page }) => {
    // Signup form smoke: the screen renders with all fields
    await page.goto('/signup')
    await expect(page.getByLabel('ชื่อที่แสดง')).toBeVisible()
    await expect(page.getByLabel('อีเมล')).toBeVisible()
    await expect(page.getByLabel('รหัสผ่าน')).toBeVisible()
    await expect(page.getByRole('button', { name: 'สมัครสมาชิก' })).toBeVisible()

    // Submitting a real signup is deliberately avoided: this Supabase project
    // requires email confirmation (mailer_autoconfirm=false), the free tier
    // rate-limits confirmation emails (~2/h), and no test inbox exists — a
    // UI-submitted signup would be flaky by construction. Provision the same
    // outcome (a confirmed brand-new user) via the admin API and run the rest
    // of the first-session journey through the UI.
    await ensureConfirmedUser(throwawayEmail, PASSWORD, 'QA Newbie')
    await login(page, throwawayEmail, PASSWORD)

    await createAccount(page, 'QA Wallet', 'KBank')
    await addTransaction(page, { type: 'expense', amount: '120', account: 'QA Wallet' })

    await page.goto('/transactions')
    await expect(page.getByText('รายจ่าย', { exact: true })).toBeVisible()
    await expect(page.getByText('-฿120.00').first()).toBeVisible()

    await page.goto('/dashboard')
    await expect(page.getByText('-฿120.00').first()).toBeVisible() // month expense total
  })
})

test('M1-S5 logged-out visitor is redirected to login', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForURL('**/login', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible()

  await page.goto('/transactions')
  await page.waitForURL('**/login', { timeout: 20_000 })
})
