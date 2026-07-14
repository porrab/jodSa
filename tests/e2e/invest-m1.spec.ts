import { test, expect } from '@playwright/test'
import { env, STORAGE_A, STORAGE_B } from './helpers/env'
import { findUserByEmail, resetInvestData } from './helpers/admin'
import { addHolding } from './helpers/invest'

/**
 * QA-M1 — JodSa Investments M1 (Holdings + Asset-Transaction Ledger), behavioral E2E
 * against a PRODUCTION build + live Supabase. Unit/RLS layers are covered elsewhere
 * (tests/unit/invest/*, tests/unit/rls.test.ts M1 block, live 25/25); this file is the
 * user-journey gate pm-desk's INVEST-M1 review routed here as QA-M1.
 *
 * Acceptance (roadmap M1 / SPEC-4):
 *   - a USD holding and a THB holding coexist; minor-unit cost basis matches a hand fixture
 *   - each asset class (us_equity/etf/thai_set/thai_fund/gold/crypto) can be added + classified
 *   - the risk_capital sleeve is visibly flagged 100%-losable
 *   - custom asset via the "+ create asset" exit (J4 empty-source rule)
 *   - th/en + light/dark on /invest · 2-user isolation over the UI
 *
 * Hand fixture (same numbers pm-desk/M1 money.test.ts pins):
 *   AAPL: 10 @ $150 + $1 fee, FX 36.5 → cost ฿54,786.50
 *   PTT : 100 @ ฿35.25 + ฿10 fee     → cost ฿3,535.00
 *
 * Order-independence (heeds QA-M7-H1): every test resets its own invest rows in
 * beforeEach, so a consolidated run is not order-flaky.
 */

test.use({ storageState: STORAGE_A })

let userIdA: string
let userIdB: string

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  const b = await findUserByEmail(env.userB.email)
  if (!a || !b) throw new Error('test users missing (userA/userB)')
  userIdA = a.id
  userIdB = b.id
})

test.beforeEach(async () => {
  await resetInvestData(userIdA)
})

test('QA-M1-1 a USD holding and a THB holding coexist; cost basis matches the hand fixture', async ({ page }) => {
  test.setTimeout(180_000)
  await addHolding(page, { asset: '(AAPL)', qty: '10', price: '150', fees: '1', fx: '36.5' })
  await addHolding(page, { asset: '(PTT)', qty: '100', price: '35.25', fees: '10' })

  await page.goto('/invest')
  // Both rows present — the multi-currency pair coexists.
  await expect(page.getByRole('button', { name: 'Apple Inc.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /ปตท/ })).toBeVisible()

  // USD holding cost basis in its NATIVE currency (10 @ $150 + $1 fee = US$1,501.00) —
  // the per-holding detail shows native cost; the THB FX conversion is the M3 dashboard's
  // job (QA-M3-1 asserts ฿58,321.50). Proves the minor-unit fold (qty·price + fees).
  await page.getByRole('button', { name: 'Apple Inc.' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('1,501.00')).toBeVisible()
  await expect(sheet.getByText(/10\s*หน่วย/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // THB holding cost basis (native THB): 100 @ ฿35.25 + ฿10 fee = ฿3,535.00.
  await page.getByRole('button', { name: /ปตท/ }).click()
  await expect(page.getByRole('dialog').getByText('3,535.00')).toBeVisible()
})

test('QA-M1-2 each asset class can be added and is classified', async ({ page }) => {
  test.setTimeout(300_000)
  // One holding per MVP asset class; foreign-currency ones carry an FX-at-cost rate.
  await addHolding(page, { asset: '(AAPL)', qty: '1', price: '150', fx: '36.5' }) // us_equity
  await addHolding(page, { asset: '(VOO)', qty: '1', price: '400', fx: '36.5' })  // etf
  await addHolding(page, { asset: '(PTT)', qty: '10', price: '35' })              // thai_set
  await addHolding(page, { asset: '(KFGG-A)', qty: '10', price: '12' })           // thai_fund
  await addHolding(page, { asset: 'ทองคำแท่ง', qty: '1', price: '38000' })         // gold
  await addHolding(page, { asset: '(BTC)', qty: '0.01', price: '60000', fx: '36.5' }) // crypto

  await page.goto('/invest')
  // Each row present AND showing its class badge (row-scoped so 'ETF' can't false-match a name).
  const cases: [string, string][] = [
    ['Apple Inc.', 'หุ้นสหรัฐฯ'],
    ['Vanguard S&P 500 ETF', 'ETF'],
    ['ปตท. จำกัด (มหาชน)', 'หุ้นไทย (SET)'],
    ['KFGG-A', 'กองทุนรวมไทย'],
    ['ทองคำแท่ง 96.5%', 'ทองคำ'],
    ['Bitcoin', 'คริปโต'],
  ]
  for (const [name, classLabel] of cases) {
    const row = page.getByRole('button', { name })
    await expect(row).toBeVisible()
    await expect(row).toContainText(classLabel)
  }
})

test('QA-M1-3 the risk_capital sleeve is flagged 100%-losable', async ({ page }) => {
  test.setTimeout(180_000)
  await addHolding(page, {
    asset: '(BTC)',
    sleeve: 'เงินเสี่ยงสูง (Risk Capital)',
    qty: '0.05',
    price: '60000',
    fx: '36.5',
  })

  await page.goto('/invest')
  await page.getByRole('button', { name: 'Bitcoin' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('เงินเสี่ยงสูง (Risk Capital)')).toBeVisible()
  // The destructive 100%-losable warning banner.
  await expect(sheet.getByText(/เสี่ยงสูญเสียได้ทั้งหมด 100%/)).toBeVisible()
})

test('QA-M1-4 a custom asset can be created via the "+ create asset" exit and held', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/invest')
  await page.getByRole('button', { name: 'เพิ่มสินทรัพย์' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // J4 empty-source exit — the inline "+ create asset" toggle.
  await dialog.getByText(/ไม่พบสินทรัพย์ที่ต้องการ/).click()
  await dialog.locator('#ca-name').fill('QA Custom Fund')
  // Two selects in the custom form: [asset class, currency] in DOM order.
  await dialog.locator('form').getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'กองทุนรวมไทย' }).click()
  await dialog.locator('form').getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: 'THB', exact: true }).click()
  await dialog.getByRole('button', { name: 'สร้างสินทรัพย์', exact: true }).click()

  // Custom asset now selected → the holding form appears; fill + save.
  await dialog.locator('#h-qty').fill('5')
  await dialog.locator('#h-price').fill('20')
  await dialog.locator('#h-datetime').fill('2025-05-15T14:30')
  await dialog.getByRole('button', { name: 'เพิ่มสินทรัพย์' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })

  await page.goto('/invest')
  await expect(page.getByRole('button', { name: 'QA Custom Fund' })).toBeVisible()
})

test('QA-M1-5 /invest renders in dark theme and in English', async ({ page }) => {
  test.setTimeout(180_000)
  await addHolding(page, { asset: '(PTT)', qty: '10', price: '35' })

  // Dark theme applies on /invest.
  await page.goto('/invest')
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('heading', { name: 'การลงทุน' })).toBeVisible()

  // Switch language to English via settings; the settings heading itself flips to
  // confirm the app-wide re-render, then /invest renders in English.
  await page.goto('/settings')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 15_000 })
  await page.goto('/invest')
  await expect(page.getByRole('heading', { name: 'Investing' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Holdings', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible()

  // Restore Thai for the rest of the suite (cookie-based, same storage state).
  await page.goto('/settings')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'ไทย' }).click()
  await expect(page.getByRole('heading', { name: 'ตั้งค่า' })).toBeVisible({ timeout: 15_000 })
})

test('QA-M1-6 2-user isolation — B sees zero of A\'s holdings', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await resetInvestData(userIdB)
  // A holds AAPL.
  await addHolding(page, { asset: '(AAPL)', qty: '10', price: '150', fx: '36.5' })
  await page.goto('/invest')
  await expect(page.getByRole('button', { name: 'Apple Inc.' })).toBeVisible()

  // B, in a separate context, sees the empty state — none of A's rows leak (RLS).
  const ctxB = await browser.newContext({ storageState: STORAGE_B })
  const pageB = await ctxB.newPage()
  await pageB.goto('/invest')
  await expect(pageB.getByText('ยังไม่มีสินทรัพย์ในพอร์ต')).toBeVisible()
  await expect(pageB.getByText('Apple Inc.')).toHaveCount(0)
  await ctxB.close()
})
