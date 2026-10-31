import { test, expect } from '@playwright/test'
import { findUserByEmail, resetAllUserData } from './helpers/admin'
import { env } from './helpers/env'
import { login, createAccount, addTransaction } from './helpers/ui'

/**
 * M1-S1 — signup form smoke + test user A's empty-state first account and expense.
 * M1-S5 — auth guard: logged-out visitor is redirected to /login.
 */

test.describe('M1-S1 signup form and first-use journey with test user A', () => {
  test.beforeAll(async () => {
    const user = await findUserByEmail(env.userA.email)
    if (!user) throw new Error('test user A missing')
    await resetAllUserData(user.id)
  })

  test('signup form → A first account → expense → listed with updated balance', async ({ page }) => {
    // Signup form smoke: the screen renders with all fields
    await page.goto('/signup')
    await expect(page.getByLabel('ชื่อที่แสดง')).toBeVisible()
    await expect(page.getByLabel('อีเมล')).toBeVisible()
    await expect(page.getByLabel('รหัสผ่าน')).toBeVisible()
    await expect(page.getByRole('button', { name: 'สมัครสมาชิก' })).toBeVisible()

    // Submitting a real signup is deliberately avoided: this Supabase project
    // requires email confirmation (mailer_autoconfirm=false), the free tier
    // rate-limits confirmation emails (~2/h), and no test inbox exists — a
    // UI-submitted signup would be flaky by construction and cannot create
    // another identity under the A/B-only boundary. Reset A's rows above and
    // run the account and expense journey through the UI.
    await login(page, env.userA.email, env.userA.password)

    await createAccount(page, 'QA Wallet', 'KBank')
    await addTransaction(page, { type: 'expense', amount: '120', account: 'QA Wallet' })

    await page.goto('/transactions')
    await expect(page.getByText('จ่าย ฿120.00', { exact: true })).toBeVisible()
    await expect(page.getByText('−฿120.00').first()).toBeVisible()

    await page.goto('/dashboard')
    await expect(page.getByText('−฿120.00').first()).toBeVisible() // month expense total
  })
})

test('M1-S5 logged-out visitor is redirected to login', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForURL('**/login', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible()

  await page.goto('/transactions')
  await page.waitForURL('**/login', { timeout: 20_000 })
})
