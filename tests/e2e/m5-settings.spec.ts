import { test, expect } from '@playwright/test'
import {
  adminClient, deleteUserById, ensureConfirmedUser, seedAccount, seedTransaction, testUserClient,
  resetAllUserData, findUserByEmail,
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

test.describe('M5-S3 account deletion cascades and signs out', () => {
  let userId: string | null = null
  let deletedBySettings = false

  test.afterAll(async () => {
    if (userId && !deletedBySettings) await deleteUserById(userId)
  })

  test('delete account → redirected to login, auth user gone, zero rows remain', async ({ page }, testInfo) => {
    const email = `qa-m5-del-${Date.now()}-${testInfo.repeatEachIndex}@jodsa.test`
    userId = await ensureConfirmedUser(email, 'QaPolish123!', 'QA Doomed')

    const accountId = await seedAccount(userId, 'Doomed Wallet', 'KBank')
    await seedTransaction(userId, accountId, { type: 'expense', amountSatang: 9_900 })

    const userClient = await testUserClient(userId)
    const { data: asset, error: assetError } = await userClient
      .from('assets')
      .select('id, currency')
      .eq('is_system', true)
      .eq('symbol', 'PTT')
      .single()
    if (assetError) throw new Error(`find PTT asset failed: ${assetError.message}`)

    const { data: holding, error: holdingError } = await userClient
      .from('holdings')
      .insert({
        user_id: userId,
        asset_id: asset.id,
        sleeve: 'core',
        current_value_minor: '10000',
        current_value_currency: asset.currency,
      })
      .select('id')
      .single()
    if (holdingError) throw new Error(`create holding failed: ${holdingError.message}`)

    const { data: fundedBuy, error: fundedBuyError } = await userClient.rpc('record_buy_with_cash', {
      p_holding_id: holding.id,
      p_qty: 1,
      p_price_minor: '10000',
      p_currency: asset.currency,
      p_fees_minor: '0',
      p_fx_rate: null,
      p_datetime: new Date().toISOString(),
      p_ref: 'm5-delete-cascade',
      p_account_id: accountId,
      p_amount_satang: 10_000,
    })
    if (fundedBuyError) throw new Error(`record_buy_with_cash failed: ${fundedBuyError.message}`)
    expect(fundedBuy).toHaveLength(1)

    const { data: investRow, error: investError } = await userClient
      .from('transactions')
      .select('holding_id, asset_transaction_id')
      .eq('id', fundedBuy![0].cash_transaction_id)
      .eq('user_id', userId)
      .single()
    if (investError) throw new Error(`read funded invest row failed: ${investError.message}`)
    expect(investRow).toMatchObject({ holding_id: holding.id, asset_transaction_id: fundedBuy![0].asset_transaction_id })

    const { error: divestError } = await userClient.from('transactions').insert({
      user_id: userId,
      type: 'divest',
      amount_satang: 2_500,
      account_id: accountId,
      holding_id: holding.id,
      datetime: new Date().toISOString(),
    })
    if (divestError) throw new Error(`seed divest failed: ${divestError.message}`)

    await login(page, email, 'QaPolish123!')
    await page.goto('/settings')
    page.on('dialog', (dialog) => dialog.accept()) // two confirm() prompts
    await page.getByRole('button', { name: 'ลบบัญชีผู้ใช้' }).click()
    await page.waitForURL('**/login', { timeout: 30_000 })

    const a = adminClient()
    const { data: deletedUser, error: deletedUserError } = await a.auth.admin.getUserById(userId)
    expect(deletedUser.user).toBeNull()
    expect(deletedUserError).not.toBeNull()
    deletedBySettings = true

    for (const table of ['accounts', 'transactions', 'budgets', 'groups', 'recurring_rules', 'holdings', 'asset_transactions'] as const) {
      const { count, error } = await a
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      expect(error).toBeNull()
      expect(count).toBe(0)
    }
  })
})
