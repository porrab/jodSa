import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetInvestData, resetAllUserData, seedAccount } from './helpers/admin'
import { addHolding, addCustomHolding, openOverview, updatePrice, openPlanTab, submitPlan } from './helpers/invest'
import { addTransaction } from './helpers/ui'

/**
 * Review acceptance: QA-INVEST-1 and DS-1 (2026-10-10).
 * Real UI/actions/database with the existing synthetic QA user, never owner data.
 * No network interception or fake valuation; each scenario rebuilds its own state.
 * Ballast persistence is deliberately outside these tests until its DB migration.
 */
test.use({ storageState: STORAGE_A })
let userIdA: string

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('canonical QA user A missing')
  userIdA = user.id
})

async function trade(page: Page, assetName: string, kind: 'ซื้อ' | 'ขาย', qty: string, datetime: string) {
  await page.goto('/invest')
  await page.getByRole('button', { name: assetName }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  const form = sheet.locator('form')
  await form.getByRole('combobox').click()
  await page.getByRole('option', { name: kind, exact: true }).click()
  await form.locator('#tx-qty').fill(qty)
  await form.locator('#tx-amount').fill('10')
  await form.locator('#tx-datetime').fill(datetime)
  await form.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  await expect(form).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
}

for (const valuationFx of ['35', undefined]) {
  test(`QA-INVEST-1 full fractional sale survives reload (${valuationFx ? 'with FX' : 'missing valuation FX'})`, async ({ page }) => {
    test.setTimeout(240_000)
    await resetInvestData(userIdA)
    await addHolding(page, { asset: '(AAPL)', qty: '0.0140444', price: '1500', fx: '35' })
    await addHolding(page, { asset: '(PTT)', qty: '10', price: '100' })
    await openOverview(page)
    await updatePrice(page, { asset: 'Apple Inc.', value: '25.49', fx: valuationFx })
    await expect(page.locator('.text-4xl').first()).toContainText(valuationFx ? '1,892.15' : '1,000.00')
    if (!valuationFx) await expect(page.getByText(/1 รายการต้องระบุอัตราแลกเปลี่ยน/)).toBeVisible()

    await page.goto('/invest')
    const row = page.getByRole('button', { name: /Apple Inc\./ })
    await expect(row).toContainText('25.49') // proves the stale valuation existed before sale
    await row.click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
    const form = sheet.locator('form')
    await form.getByRole('combobox').click()
    await page.getByRole('option', { name: 'ขาย', exact: true }).click()
    await form.locator('#tx-qty').fill('0.0140444')
    await form.locator('#tx-amount').fill('1870.35')
    await form.locator('#tx-fees').fill('0.02')
    await form.locator('#tx-datetime').fill('2026-09-05T14:30')
    await form.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
    await expect(form).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()

    await page.reload()
    await expect(row).toContainText(/0\s*หน่วย/)
    await expect(row).toContainText('0.00')
    await expect(row).not.toContainText('25.49')
    await row.click()
    await expect(sheet.locator('.text-4xl')).toContainText('0.00')
    await expect(sheet.getByText(/ต้นทุนรวม|ต้นทุน/).first()).toContainText('0.00')
    await expect(sheet.getByText(/กำไร\/ขาดทุน/)).toContainText('0.00')
    await expect(sheet.getByText(/ขาย.*0\.0140444/)).toBeVisible() // history remains
    await page.keyboard.press('Escape')
    await openOverview(page)
    await expect(page.locator('.text-4xl').first()).toContainText('1,000.00')
    await expect(page.getByText(/ต้องระบุอัตราแลกเปลี่ยน/)).toHaveCount(0)
    const concentration = page.locator('[data-slot="card"]').filter({ hasText: 'ความกระจุกตัว' })
    await expect(concentration.getByText('100.0%', { exact: true })).toBeVisible()
    // Closed holdings remain in history, but no longer occupy concentration entries.
    await expect(page.getByText('Apple Inc.', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'บันทึกสแนปช็อต' }).click()
    await expect(page.getByText('ประวัติสแนปช็อต')).toBeVisible()
    await openOverview(page)
    await page.getByRole('button', { name: /1,000\.00/ }).click()
    await expect(page.getByRole('dialog').getByText('฿1,000.00', { exact: true })).toBeVisible()
  })
}

test('QA-INVEST-1 partial, closed missing-FX/null-proxy, and reopened positions reach the real planner', async ({ page }) => {
  test.setTimeout(300_000)
  await resetInvestData(userIdA)
  const assetName = 'QA review unclassified foreign'
  await addCustomHolding(page, {
    name: assetName, assetClassLabel: 'หุ้นสหรัฐฯ', currency: 'USD', qty: '2', price: '10', fx: '35',
  })
  await addHolding(page, { asset: '(PTT)', qty: '10', price: '100' })
  await openOverview(page)
  await updatePrice(page, { asset: assetName, value: '50', fx: '35' })
  await trade(page, assetName, 'ขาย', '1', '2026-09-04T14:30')
  await page.reload()
  const row = page.getByRole('button', { name: assetName })
  await expect(row).toContainText(/1\s*หน่วย/)
  await expect(row).toContainText('50.00') // active positions keep the manual total-value convention
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีสินทรัพย์ที่ต้องจัดประเภทก่อน')).toBeVisible({ timeout: 60_000 })

  await trade(page, assetName, 'ขาย', '1', '2026-09-05T14:30')
  await openOverview(page)
  await updatePrice(page, { asset: assetName, value: '50', fx: '' })
  await page.reload()
  await page.getByRole('button', { name: 'ภาพรวม', exact: true }).click()
  await expect(page.locator('.text-4xl').first()).toContainText('1,000.00')
  await expect(page.getByText(/ต้องระบุอัตราแลกเปลี่ยน/)).toHaveCount(0)
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText(/มูลค่าพอร์ตที่ใช้คำนวณ/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('มีสินทรัพย์ที่ต้องจัดประเภทก่อน')).toHaveCount(0)
  await expect(page.getByText(/มูลค่าพอร์ตที่ใช้คำนวณ/)).toContainText('฿1,000.00')

  await trade(page, assetName, 'ซื้อ', '1', '2026-09-06T14:30')
  await page.reload()
  await expect(row).toContainText(/1\s*หน่วย/)
  await expect(row).toContainText('50.00')
  await openOverview(page)
  await updatePrice(page, { asset: assetName, value: '50', fx: '35' })
  await expect(page.locator('.text-4xl').first()).toContainText('2,750.00')
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีสินทรัพย์ที่ต้องจัดประเภทก่อน')).toBeVisible({ timeout: 60_000 })
})

test('DS-1 keyboard focus appears without a shadow transition', async ({ page }) => {
  await page.goto('/budgets')
  const button = page.getByRole('button', { name: 'เพิ่มงบประมาณ', exact: true })
  await expect(button).toBeVisible()
  // Use keyboard navigation so :focus-visible is genuinely active.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    if (await button.evaluate((el) => document.activeElement === el)) break
  }
  await expect(button).toBeFocused()
  const focus = await button.evaluate((el) => {
    const css = getComputedStyle(el)
    return { visible: el.matches(':focus-visible'), shadow: css.boxShadow, transition: css.transitionProperty }
  })
  expect(focus.visible).toBe(true)
  expect(focus.shadow).not.toBe('none')
  expect(focus.transition.split(',').map((p) => p.trim())).not.toEqual(expect.arrayContaining(['all']))
  expect(focus.transition).not.toMatch(/box-shadow|outline/)
})

test('DS-1 real budget progress scales to 50% and disables motion when requested', async ({ page }) => {
  test.setTimeout(180_000)
  await resetAllUserData(userIdA)
  const account = 'QA review 20261010 budget'
  await seedAccount(userIdA, account, 'SCB')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/budgets')
  await page.getByRole('button', { name: 'เพิ่มงบประมาณ' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('งบประมาณ (บาท)').fill('1000')
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(dialog).toBeHidden()
  await addTransaction(page, { type: 'expense', amount: '500', account })
  await page.goto('/budgets')
  await expect(page.getByText('฿500.00 / ฿1,000.00')).toBeVisible()
  // BudgetBar currently has no accessible progress role; scope this structural
  // selector to its single persisted budget card, not an invented test-only DOM.
  const card = page.locator('[data-slot="card"]').filter({ hasText: '฿500.00 / ฿1,000.00' })
  const fill = card.locator('.overflow-hidden > div')
  await expect(fill).toHaveCount(1)
  const normal = await fill.evaluate((el) => {
    const css = getComputedStyle(el)
    const parent = el.parentElement!
    return {
      transition: css.transitionProperty,
      duration: css.transitionDuration,
      transform: css.transform,
      layoutRatio: parseFloat(css.width) / parent.getBoundingClientRect().width,
      visualRatio: el.getBoundingClientRect().width / parent.getBoundingClientRect().width,
      origin: css.transformOrigin,
    }
  })
  expect(normal.transition).toContain('transform')
  expect(normal.transition).not.toMatch(/(^|,\s*)(all|width)(,|$)/)
  expect(normal.duration).not.toBe('0s')
  expect(normal.transform).not.toBe('none')
  expect(normal.layoutRatio).toBeCloseTo(1, 2)
  expect(normal.visualRatio).toBeCloseTo(0.5, 2)
  expect(normal.origin).toMatch(/^0px /)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(fill).toHaveCSS('transition-property', 'none')
  const reducedRatio = await fill.evaluate((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width)
  expect(reducedRatio).toBeCloseTo(0.5, 2)
})
