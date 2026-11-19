import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, resetInvestData, seedAccount, testUserClient } from './helpers/admin'
import { seedGroup } from './helpers/admin'
import { seedTripSession, deleteTripSession } from './helpers/trip'
import { addCustomHolding, openPlanTab, submitPlan } from './helpers/invest'
import type { Page } from '@playwright/test'
import th from '../../messages/th.json'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
let accountId: string

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing canonical test user A')
  await resetAllUserData(user.id)
  await resetInvestData(user.id)
  accountId = await seedAccount(user.id, 'Mobile audit A', 'SCB')
  await seedAccount(user.id, 'Mobile audit B', 'KBank')
})

async function expectMobileLayout(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.documentElement
    const clipped = [...document.querySelectorAll('button, [role="button"]')].flatMap(element => {
      const rect = element.getBoundingClientRect()
      if (!element.getClientRects().length || rect.width === 0 || rect.height === 0 || getComputedStyle(element).visibility === 'hidden') return []
      let left = 0, right = root.clientWidth
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) {
          const box = parent.getBoundingClientRect()
          left = Math.max(left, box.left); right = Math.min(right, box.right)
        }
      }
      return rect.left < left - 1 || rect.right > right + 1
        ? [{ label: element.getAttribute('aria-label') ?? element.textContent, left: rect.left, right: rect.right, clip: [left, right] }] : []
    })
    return { width: root.clientWidth, scroll: root.scrollWidth, clipped }
  })
  expect(result.scroll, `Horizontal overflow at ${page.url()}`).toBeLessThanOrEqual(result.width)
  expect(result.clipped, `Clipped buttons at ${page.url()}`).toEqual([])
}

test('FB-3 every signed-in page, tab and add sheet fits 375x812 in both themes', async ({ page }) => {
  test.setTimeout(240_000)
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing canonical test user A')
  const groupId = await seedGroup(user.id, 'Mobile audit group')
  const trip = await seedTripSession(user.id, 'Mobile audit trip')
  const db = await testUserClient(user.id)
  const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
  const { data: rule, error } = await db.from('recurring_rules').insert({
    user_id: user.id, account_id: accountId, type: 'expense', amount_satang: 12345,
    category: 'Mobile audit recurrence', freq: 'monthly', interval: 1, start_date: date,
  }).select('id').single()
  if (error) throw error
  try {
    await addCustomHolding(page, { name: 'สินทรัพย์ทดสอบชื่อยาวสำหรับหน้าจอโทรศัพท์', assetClassLabel: 'กองทุนรวมไทย', currency: 'THB', qty: '1', price: '100' })
    for (const theme of ['สว่าง', 'มืด']) {
      await page.goto('/settings'); await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: theme, exact: true }).click()
      await expect(page.locator('html')).toHaveClass(theme === 'มืด' ? /dark/ : /light/)
      for (const route of ['/dashboard', '/transactions', '/budgets', '/accounts', '/recurring', `/recurring/confirm?rule=${rule.id}&date=${date}`, '/sessions', `/sessions/${trip.token}`, '/groups', `/groups/${groupId}`, '/invest', '/settings', '/more', '/import']) {
        await page.goto(route); await page.waitForLoadState('networkidle')
        const url = new URL(page.url())
        expect(url.pathname + url.search).toBe(route)
        await expect(page.getByRole('heading').first()).not.toHaveText('404')
        if (route.startsWith('/recurring/confirm?')) await expect(page.getByRole('heading', { name: 'Mobile audit recurrence', exact: true })).toBeVisible()
        await expectMobileLayout(page)
        if (route === '/budgets' || route === '/invest') {
          for (const tab of await page.getByRole('tab').all()) { await tab.click(); await expectMobileLayout(page) }
        }
      }
      await openPlanTab(page); await submitPlan(page)
      await expect(page.getByText('มีสินทรัพย์ยังไม่จัดประเภท', { exact: true })).toBeVisible()
      await expectMobileLayout(page)
      await page.goto('/dashboard'); await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
      for (const type of ['รายจ่าย', 'รายรับ', 'โอนเงิน']) {
        await page.getByRole('button', { name: type, exact: true }).click(); await expectMobileLayout(page)
      }
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await page.goto('/invest'); await page.waitForLoadState('networkidle')
      for (const tab of await page.getByRole('tab').all()) {
        await tab.click(); await page.getByRole('button', { name: 'เพิ่มสินทรัพย์', exact: true }).click()
        await expect(page.getByRole('dialog')).toBeVisible(); await expectMobileLayout(page)
        await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
        await expect(page.getByRole('dialog')).toBeHidden()
      }
    }
  } finally {
    await deleteTripSession(trip)
    expect((await db.from('transactions').delete().eq('recurring_rule_id', rule.id)).error).toBeNull()
    expect((await db.from('recurring_rules').delete().eq('id', rule.id)).error).toBeNull()
  }
})

test('FB-1 header Add opens on every investment tab', async ({ page }) => {
  await page.goto('/invest')
  await page.waitForLoadState('networkidle')
  for (const name of [th.invest.tabHoldings, th.invest.tabOverview, th.invest.tabPlan]) {
    await page.getByRole('tab', { name, exact: true }).click()
    await page.getByRole('button', { name: 'เพิ่มสินทรัพย์', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'เพิ่มสินทรัพย์', exact: true })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(sheet).toBeHidden()
  }
})
