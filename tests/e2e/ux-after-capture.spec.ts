import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, resetInvestData, seedAccount } from './helpers/admin'
import { addHolding } from './helpers/invest'
import { clearOwnerSessions, deleteTripSession, seedTripSession } from './helpers/trip'
import th from '../../messages/th.json'

// Explicit evidence job: run after the production gates, never concurrently with
// another A-fixture suite. All seed/reset calls use the existing guarded helpers.
test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
test.describe.configure({ mode: 'serial' })
const output = path.resolve('../../design-studio/reviews/jodsa/2026-11-18-mobile-audit/after')

async function ready(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).not.toHaveURL(/\/login/)
}

async function capture(page: Page, theme: string, state: string) {
  await ready(page)
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
  await mkdir(output, { recursive: true })
  const meta = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    theme: document.documentElement.className, url: location.pathname,
  }))
  expect(meta.width).toBe(375)
  expect(meta.height).toBe(812)
  expect(meta.scrollWidth).toBeLessThanOrEqual(375)
  await page.screenshot({ path: path.join(output, `${theme}-${state}.jpg`), type: 'jpeg', quality: 90, animations: 'disabled' })
  await writeFile(path.join(output, `${theme}-${state}.txt`), `${JSON.stringify(meta)}\n${await page.locator('body').ariaSnapshot()}\n`, 'utf8')
}

for (const theme of ['light', 'dark'] as const) {
  test(`DS-8..14 after evidence at 375x812 in ${theme}`, async ({ page }) => {
    test.skip(process.env.JODSA_CAPTURE_UX !== '1', 'Explicit production evidence job; A fixtures are reset.')
    test.setTimeout(240_000)
    const user = await findUserByEmail(env.userA.email)
    if (!user) throw new Error('Missing canonical test user A')
    await clearOwnerSessions(user.id)
    await resetInvestData(user.id)
    await resetAllUserData(user.id)
    await seedAccount(user.id, 'DS audit wallet', 'SCB')
    await page.addInitScript(value => localStorage.setItem('theme', value), theme)
    await page.goto('/settings')
    await ready(page)
    await expect(page.getByText(env.userA.email, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'ไทย', exact: true }).click()

    // Missing valuation remains missing despite a real cost basis in both currencies.
    await addHolding(page, { asset: '(AAPL)', qty: '1', price: '100', fx: '35' })
    await addHolding(page, { asset: '(PTT)', qty: '10', price: '30' })
    await page.goto('/invest')
    await ready(page)
    await expect(page.getByTestId('holdings-total')).toHaveCount(1)
    await expect(page.getByTestId('holdings-total')).toHaveText('—')
    await capture(page, theme, 'invest-holdings')
    await page.getByRole('button').filter({ hasText: 'Apple' }).click()
    const detail = page.getByRole('dialog')
    await expect(detail.getByText(th.invest.noCurrentValue, { exact: true })).toBeVisible()
    expect(await detail.getByText(th.invest.noCurrentValue, { exact: true }).evaluate(el => getComputedStyle(el).fontSize)).toBe('14px')
    await capture(page, theme, 'holding-detail')
    await detail.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
    await expect(page.getByRole('dialog').locator('#tx-amount')).toBeVisible()
    await capture(page, theme, 'invest-add-transaction')

    await page.goto('/invest')
    await page.getByRole('tab', { name: 'ภาพรวม', exact: true }).click()
    await expect(page.getByRole('button', { name: th.invest.saveSnapshot, exact: true })).toBeVisible()
    await capture(page, theme, 'invest-overview')
    await page.getByRole('tab', { name: 'แผนรายเดือน', exact: true }).click()
    await expect(page.getByTestId('plan-disclaimer')).not.toHaveAttribute('open')
    await capture(page, theme, 'invest-plan')
    await page.getByRole('button', { name: 'สร้างแผน', exact: true }).scrollIntoViewIfNeeded()
    await capture(page, theme, 'invest-plan-bottom')

    await page.goto('/invest')
    await page.getByRole('button', { name: 'เพิ่มสินทรัพย์', exact: true }).click()
    await page.getByRole('dialog').getByRole('combobox').first().click()
    await page.getByRole('option', { name: '(AAPL)' }).click()
    await expect(page.getByRole('dialog').locator('#h-price-hint')).toBeVisible()
    await expect(page.getByRole('dialog').locator('#h-qty-hint')).not.toBeVisible()
    await capture(page, theme, 'invest-add-holding')

    await page.goto('/settings')
    for (const section of ['csv', 'vision', 'push']) await expect(page.getByTestId(`settings-${section}`)).not.toHaveAttribute('open')
    await capture(page, theme, 'settings')
    const vision = page.getByTestId('settings-vision')
    await vision.locator('summary').click()
    await vision.scrollIntoViewIfNeeded()
    await expect(vision.getByText(th.vision.privacy, { exact: true })).toBeVisible()
    await capture(page, theme, 'settings-middle')
    await vision.locator('summary').click()
    await page.getByTestId('settings-push').locator('summary').click()
    await page.getByRole('button', { name: th.settings.deleteAccount, exact: true }).scrollIntoViewIfNeeded()
    await capture(page, theme, 'settings-bottom')

    await page.goto('/sessions')
    await expect(page.getByText(th.session.emptyHint, { exact: true })).toBeVisible()
    await capture(page, theme, 'sessions-empty')
    await page.getByRole('button', { name: 'เพิ่ม', exact: true }).click()
    await expect(page.getByRole('dialog').getByText(th.session.typeCollectHint, { exact: true })).toBeVisible()
    await capture(page, theme, 'session-add-payment')
    const trip = await seedTripSession(user.id, 'DS audit shared trip')
    try {
      await page.goto('/sessions')
      await expect(page.getByRole('link', { name: /DS audit shared trip/ })).toBeVisible()
      await capture(page, theme, 'sessions-populated')
      await capture(page, theme, 'sessions')
      await page.goto(`/sessions/${trip.token}`)
      await expect(page.getByRole('heading', { name: 'DS audit shared trip' })).toBeVisible()
      await capture(page, theme, 'session-detail')
    } finally { await deleteTripSession(trip) }

    await page.goto('/dashboard')
    await capture(page, theme, 'home')
    await page.goto('/more')
    await capture(page, theme, 'more')
  })
}
