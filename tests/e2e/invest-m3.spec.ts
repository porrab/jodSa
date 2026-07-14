import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetInvestData } from './helpers/admin'
import { addHolding, openOverview, updatePrice } from './helpers/invest'

/**
 * QA-M3 — JodSa Investments M3 (Portfolio Dashboard), behavioral E2E against a
 * PRODUCTION build + live Supabase. Bundled with QA-M1 per pm-desk's INVEST-M3 review.
 * Portfolio math is exhaustively unit-tested (tests/unit/invest/portfolio.test.ts) and
 * portfolio_snapshots RLS is live-verified (rls.test.ts 29/29); this file is the
 * user-visible dashboard journey the units can't cover.
 *
 * Acceptance (roadmap M3 / SPEC-4): totals/P&L/allocation match a hand fixture; updating
 * a price re-computes value + P&L; a past snapshot reloads from history (no drift);
 * numbers match across views; per-asset aggregation before concentration; missing/blank-FX
 * holding excluded from totals and surfaced via the banner (pm-desk forward note #2).
 *
 * Fixture (matches M1/pm-desk money.test.ts): AAPL 10 @ $150 + $1 fee FX 36.5 → cost
 * ฿54,786.50 ; PTT 100 @ ฿35.25 + ฿10 fee → cost ฿3,535.00 ; unpriced total ฿58,321.50.
 *
 * Order-independence (heeds QA-M7-H1): every test resets + builds its own fixture.
 */

test.use({ storageState: STORAGE_A })

let userIdA: string

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error('test user missing (userA)')
  userIdA = a.id
})

test.beforeEach(async () => {
  await resetInvestData(userIdA)
})

/** The standard USD+THB fixture (both unpriced → valued at cost). */
async function seedFixture(page: import('@playwright/test').Page) {
  await addHolding(page, { asset: '(AAPL)', qty: '10', price: '150', fees: '1', fx: '36.5' })
  await addHolding(page, { asset: '(PTT)', qty: '100', price: '35.25', fees: '10' })
}

test('QA-M3-1 dashboard totals/cost/P&L, allocation and concentration match the fixture', async ({ page }) => {
  test.setTimeout(180_000)
  await seedFixture(page)
  await openOverview(page)

  // Total value (focal) + cost + P&L. Unpriced → value == cost, P&L 0.
  await expect(page.locator('.text-2xl').first()).toContainText('58,321.50')
  await expect(page.getByText(/ต้นทุนรวม.*58,321\.50/)).toBeVisible()
  await expect(page.getByText(/กำไร\/ขาดทุน.*0\.00/)).toBeVisible()
  await expect(page.getByText(/2 รายการยังไม่ได้ตั้งราคาปัจจุบัน/)).toBeVisible()

  // Allocation, all three axes.
  await expect(page.getByText('แบ่งตามประเภทสินทรัพย์')).toBeVisible()
  await expect(page.getByText('แบ่งตามสกุลเงิน')).toBeVisible()
  await expect(page.getByText('แบ่งตามระดับความเสี่ยง')).toBeVisible()

  // Concentration — AAPL at 93.9% fires the ≥25% badge.
  await expect(page.getByText('ความกระจุกตัว')).toBeVisible()
  await expect(page.getByText('กระจุกตัวสูง')).toBeVisible()
  await expect(page.getByText('93.9%')).toBeVisible()
})

test('QA-M3-2 updating a price re-computes value + P&L', async ({ page }) => {
  test.setTimeout(180_000)
  await seedFixture(page)
  await openOverview(page)
  await expect(page.locator('.text-2xl').first()).toContainText('58,321.50') // pre-update baseline

  // Price AAPL at $2,000 (FX 36.5) → value ฿73,000; PTT stays unpriced-at-cost ฿3,535.
  await updatePrice(page, { asset: 'Apple Inc.', value: '2000', fx: '36.5' })

  await expect(page.locator('.text-2xl').first()).toContainText('76,535.00') // 73,000 + 3,535
  await expect(page.getByText(/ต้นทุนรวม.*58,321\.50/)).toBeVisible()          // cost unchanged
  await expect(page.getByText(/กำไร\/ขาดทุน.*18,213\.50/)).toBeVisible()       // P&L recomputed
  await expect(page.getByText(/1 รายการยังไม่ได้ตั้งราคาปัจจุบัน/)).toBeVisible() // only PTT now
})

test('QA-M3-3 a saved snapshot reloads from history with identical numbers (no drift)', async ({ page }) => {
  test.setTimeout(180_000)
  await seedFixture(page)
  await openOverview(page)
  await updatePrice(page, { asset: 'Apple Inc.', value: '2000', fx: '36.5' })
  await expect(page.locator('.text-2xl').first()).toContainText('76,535.00')

  // Save a snapshot of the current ฿76,535.00 / P&L ฿18,213.50 state.
  await page.getByRole('button', { name: 'บันทึกสแนปช็อต' }).click()
  await expect(page.getByText('ประวัติสแนปช็อต')).toBeVisible({ timeout: 15_000 })

  // Reload the app fresh, reopen Overview, open the snapshot from history.
  await openOverview(page)
  await expect(page.getByText('ประวัติสแนปช็อต')).toBeVisible()
  await page.getByRole('button', { name: /76,535\.00/ }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  // Stored jsonb rendered verbatim — no recompute drift.
  await expect(sheet.getByText('76,535.00')).toBeVisible()
  await expect(sheet.getByText(/18,213\.50/)).toBeVisible()
})

test('QA-M3-4 two holding rows of the same asset aggregate before concentration', async ({ page }) => {
  test.setTimeout(180_000)
  // Two AAPL rows (₿5,475,000 minor each → merged ฿109,500) + one PTT sized (฿70,000) so a
  // SINGLE AAPL row would rank below PTT, but the MERGED AAPL position outranks it.
  await addHolding(page, { asset: '(AAPL)', qty: '10', price: '150', fx: '36.5' })
  await addHolding(page, { asset: '(AAPL)', sleeve: 'เสริม (Satellite)', qty: '10', price: '150', fx: '36.5' })
  await addHolding(page, { asset: '(PTT)', qty: '100', price: '700' })

  // Holdings tab: two distinct AAPL rows exist.
  await page.goto('/invest')
  await expect(page.getByRole('button', { name: 'Apple Inc.' })).toHaveCount(2)

  // Overview: asset names appear ONLY in concentration → AAPL merged to a single entry.
  await openOverview(page)
  await expect(page.getByText('Apple Inc.')).toHaveCount(1)
  await expect(page.getByText('61.0%')).toBeVisible() // merged AAPL (10,950,000 / 17,950,000)
  await expect(page.getByText('39.0%')).toBeVisible() // PTT (7,000,000 / 17,950,000)
  await expect(page.getByText('กระจุกตัวสูง')).toBeVisible()
})

test('QA-M3-5 a blank-FX foreign holding is excluded from totals and surfaced via the banner', async ({ page }) => {
  test.setTimeout(180_000)
  await seedFixture(page)
  await openOverview(page)
  // Both included at cost (AAPL has an FX-at-cost rate) → no excluded banner yet.
  await expect(page.locator('.text-2xl').first()).toContainText('58,321.50')
  await expect(page.getByText(/ต้องระบุอัตราแลกเปลี่ยน/)).toHaveCount(0)

  // Update AAPL's current value but leave FX BLANK → it drops out of the total.
  await updatePrice(page, { asset: 'Apple Inc.', value: '2000' })

  await expect(page.locator('.text-2xl').first()).toContainText('3,535.00') // PTT only
  await expect(page.getByText(/1 รายการต้องระบุอัตราแลกเปลี่ยน/)).toBeVisible() // excluded-FX banner
})
