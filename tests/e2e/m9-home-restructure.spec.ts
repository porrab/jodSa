import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import {
  findUserByEmail,
  resetAllUserData,
  resetInvestData,
  seedAccount,
  seedBudget,
  seedInvestHolding,
  seedTransaction,
} from './helpers/admin'

/**
 * QA-M9 — Home restructure (design v3 J1/J6), production build.
 *
 * Behavioral proof of two acceptance criteria:
 *  - Home (/dashboard) shows quick-add + today's transactions + a one-line budget,
 *    and renders NO chart (the 6-month chart nobody read is gone from the first
 *    screen). Asserted by the ABSENCE of any Recharts DOM on /dashboard.
 *  - The 6-month chart renders under งบ → ภาพรวม (lazy). Asserted by Recharts DOM
 *    appearing only after the ภาพรวม tab is opened AND the seeded expense
 *    producing a non-zero bar (mounting an all-zero chart is not success).
 */

test.use({ storageState: STORAGE_A })

let userId: string

test.beforeAll(async () => {
  const u = await findUserByEmail(env.userA.email)
  if (!u) throw new Error(`test user A missing: ${env.userA.email}`)
  userId = u.id
  await resetAllUserData(userId)
  await resetInvestData(userId)
  const acct = await seedAccount(userId, 'เงินสด', 'KBank')
  for (const [name, bank] of [
    ['make', 'KBank'],
    ['krungthai', 'KTB'],
    ['Dime! Save', 'KKP'],
    ['SCB', 'SCB'],
    ['TrueMoney', 'TrueMoney'],
  ] as const) {
    await seedAccount(userId, name, bank)
  }
  await seedBudget(userId, 1_000_000) // ฿10,000 overall month budget
  await seedTransaction(userId, acct, { type: 'expense', amountSatang: 50_000, category: 'food' }) // ฿500 today
  await seedInvestHolding(userId, {
    symbol: 'PTT',
    currentValueMinor: '100000', // active holding: ฿1,000
    ledger: [{ type: 'buy', qty: '10', priceMinor: '10000', datetime: '2026-01-01T00:00:00Z' }],
  })
  await seedInvestHolding(userId, {
    symbol: 'PTT',
    currentValueMinor: '500000', // deliberately stale: sold holding must contribute ฿0
    ledger: [
      { type: 'buy', qty: '5', priceMinor: '10000', datetime: '2026-01-01T00:00:00Z' },
      { type: 'sell', qty: '5', priceMinor: '11000', datetime: '2026-02-01T00:00:00Z' },
    ],
  })
})

test('M9-home-1 Home shows quick-add + today list + one-line budget, and NO chart renders', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  // OWNER-FB B1: the deterministic fixture includes an active holding, so Home must
  // show the combined approximate headline plus both visible component lines.
  const moneyHeader = page.getByRole('button', { name: /เงินทั้งหมด \(บัญชี \+ ลงทุน\).*≈/ })
  await expect(moneyHeader).toBeVisible()
  await expect(page.getByRole('button', { name: /เงินในบัญชี.*500\.00/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /เงินลงทุน.*1,000\.00/ })).toBeVisible()
  await moneyHeader.click()
  await expect(page.getByRole('heading', { name: 'เงินทั้งหมด' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'เงินในบัญชี' })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  // Focal balance + quick-add block.
  await expect(page.getByLabel('จำนวนเงิน')).toBeVisible() // quick-add amount input
  await expect(page.getByRole('link', { name: 'สแกนสลิป' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'บันทึก', exact: true })).toBeVisible()

  // OWNER-FB B2: the old one-line budget becomes a single monthly budget strip.
  const budgetStrip = page.getByRole('link', { name: /งบเดือนนี้/ })
  await expect(budgetStrip).toContainText('เหลือ ฿9,500.00 จาก ฿10,000.00')
  await expect(budgetStrip).toContainText('ใช้ได้อีกวันละ')
  await expect(budgetStrip.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50000')

  // Today's transactions section present with the seeded item.
  await expect(page.getByText('รายการวันนี้', { exact: false })).toBeVisible()
  await expect(page.locator('body')).toContainText('500.00')
  await expect(page.getByRole('heading', { name: /รายการวันนี้ \(1\).*จ่าย.*500\.00/ })).toBeVisible()

  // NO chart on Home — this is the acceptance criterion. No Recharts DOM at all,
  // and the 6-month chart heading is absent from /dashboard.
  await expect(page.locator('[class*="recharts"]')).toHaveCount(0)
  await expect(page.getByText('รายรับ/รายจ่าย 6 เดือนล่าสุด')).toHaveCount(0)
  await expect(page.locator('svg.recharts-surface')).toHaveCount(0)
})

test('RV-OWNERFB-1 Home investment total matches /invest and omits a fully-sold stale holding', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const homeInvestment = page.getByRole('button', { name: /เงินลงทุน/ })
  await expect(homeInvestment).toContainText('฿1,000.00')
  await homeInvestment.click()
  const investmentSection = page.locator('#money-invest')
  await expect(investmentSection).toContainText('฿1,000.00')
  await expect(investmentSection.getByRole('link')).toHaveCount(1)
  await page.getByRole('button', { name: 'Close' }).click()

  await page.goto('/invest')
  await page.getByRole('button', { name: 'ภาพรวม', exact: true }).click()
  await expect(page.getByText('฿1,000.00', { exact: true }).first()).toBeVisible()
})

test('OWNER-FB B3 transaction day header shows expense-only daily total', async ({ page }) => {
  await page.goto('/transactions')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('heading', { name: /วันนี้/ })).toBeVisible()
  await expect(page.getByText('จ่าย ฿500.00', { exact: true })).toBeVisible()
})

test('OWNER-FB A2 AccountGrid exposes six stable balance tiles and dims the transfer source', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()

  const accountGrid = page.getByRole('radiogroup', { name: 'บัญชี', exact: true })
  await expect(accountGrid).toBeVisible()
  await expect(accountGrid.getByRole('radio')).toHaveCount(6)
  const cashTile = accountGrid.getByRole('radio', { name: /เงินสด, KBank/ })
  await expect(cashTile).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => cashTile.getAttribute('aria-label')).toContain('500.00')
  await expect(cashTile).not.toHaveAccessibleName(/กำลังโหลดยอด/)

  const makeTile = accountGrid.getByRole('radio', { name: /make, KBank/ })
  await makeTile.focus()
  await page.keyboard.press('ArrowRight')
  await expect(accountGrid.getByRole('radio', { name: /krungthai, KTB/ })).toBeFocused()

  await page.getByRole('button', { name: 'โอนเงิน', exact: true }).click()
  const fromGrid = page.getByRole('radiogroup', { name: 'บัญชีต้นทาง' })
  const toGrid = page.getByRole('radiogroup', { name: 'บัญชีปลายทาง' })
  await expect(fromGrid.getByRole('radio')).toHaveCount(6)
  await expect(toGrid.getByRole('radio')).toHaveCount(6)
  await expect(toGrid.getByRole('radio', { name: /เงินสด, KBank/ })).toHaveAttribute('aria-disabled', 'true')

  await toGrid.getByRole('radio', { name: /make, KBank/ }).click()
  const swap = page.getByRole('button', { name: 'สลับบัญชี' })
  await expect(swap).toBeEnabled()
  await swap.click()
  await expect(fromGrid.getByRole('radio', { name: /make, KBank/ })).toHaveAttribute('aria-checked', 'true')
  await expect(toGrid.getByRole('radio', { name: /เงินสด, KBank/ })).toHaveAttribute('aria-checked', 'true')
})

test('M9-home-2 the 6-month chart renders under งบ → ภาพรวม (lazy), not before', async ({ page }) => {
  await page.goto('/budgets')
  await page.waitForLoadState('networkidle')

  // Default tab is งบประมาณ (budget bars) — no chart yet.
  await expect(page.getByRole('button', { name: 'ภาพรวม', exact: true })).toBeVisible()
  await expect(page.locator('[class*="recharts"]')).toHaveCount(0)

  // Open ภาพรวม → the lazy chart chunk mounts and Recharts DOM appears.
  await page.getByRole('button', { name: 'ภาพรวม', exact: true }).click()
  await expect(page.getByText('รายรับ/รายจ่าย 6 เดือนล่าสุด')).toBeVisible()
  await expect(page.locator('[class*="recharts"]').first()).toBeVisible({ timeout: 30_000 })

  // OWNER-FB regression guard: the old test stopped at "the chart mounted",
  // which cannot distinguish real monthly aggregation from six zero buckets.
  // This fixture seeded ฿500 of expense in the current Bangkok month, so at
  // least one expense rectangle must have a positive rendered height.
  const expenseBars = page.locator(
    '.recharts-bar-rectangles path.recharts-rectangle[fill="var(--expense)"]',
  )
  await expect.poll(async () => {
    const heights = await expenseBars.evaluateAll((bars) =>
      bars.map((bar) => Number(bar.getAttribute('height') ?? 0)),
    )
    return Math.max(0, ...heights)
  }).toBeGreaterThan(0)
})
