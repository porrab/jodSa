import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetUserData } from './helpers/admin'
import { login, createAccount, addTransaction } from './helpers/ui'

/**
 * M1-S3 — the blueprint's hand fixture: income 1,000 + expense 250 + transfer
 * 300 (X→Y). Transfer must change both balances while appearing in neither
 * income nor expense totals. balance = Σincome − Σexpense − Σout + Σin.
 * M1-S4 — "second device": a brand-new browser logs in and sees the same data.
 */

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetUserData(user.id)
})

async function assertFixtureNumbers(page: import('@playwright/test').Page) {
  await page.goto('/dashboard')
  await expect(page.getByText('+฿1,000.00')).toBeVisible() // month income — transfer excluded
  await expect(page.getByText('-฿250.00')).toBeVisible() // month expense — transfer excluded
  await expect(page.getByText('฿750.00').first()).toBeVisible() // net total = 1000 − 250
  await expect(page.getByText('฿450.00')).toBeVisible() // QA-X = 1000 − 250 − 300
  await expect(page.getByText('QA-Y', { exact: true })).toBeVisible()
  await expect(page.getByText('฿300.00').first()).toBeVisible() // QA-Y = +300 transfer_in
}

test('M1-S3 transfer/balance hand fixture', async ({ page }) => {
  await createAccount(page, 'QA-X', 'SCB')
  await createAccount(page, 'QA-Y', 'KBank')
  await addTransaction(page, { type: 'income', amount: '1000', account: 'QA-X' })
  await addTransaction(page, { type: 'expense', amount: '250', account: 'QA-X' })
  await addTransaction(page, { type: 'transfer', amount: '300', account: 'QA-X', toAccount: 'QA-Y' })

  await assertFixtureNumbers(page)

  // the transfer is one neutral row, not an expense
  await page.goto('/transactions')
  await expect(page.getByText('โอนเงิน', { exact: true })).toBeVisible()
  await expect(page.getByText('→ QA-Y')).toBeVisible()
})

test('M1-S4 second device sees the same data after load', async ({ browser }) => {
  // Explicit empty storageState: in @playwright/test, browser.newContext()
  // inherits test.use options, so a bare newContext() would silently reuse
  // user A's session and /login would bounce straight to /dashboard.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await login(page, env.userA.email, env.userA.password)

  await assertFixtureNumbers(page)

  await page.goto('/transactions')
  await expect(page.getByText('+฿1,000.00')).toBeVisible()
  await expect(page.getByText('-฿250.00')).toBeVisible()
  await expect(page.getByText('→ QA-Y')).toBeVisible()
  await ctx.close()
})
