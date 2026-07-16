import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetInvestData, setAssetProxyClass } from './helpers/admin'
import {
  addHolding,
  addCustomHolding,
  openPlanTab,
  setTargetAllocation,
  submitPlan,
} from './helpers/invest'

/**
 * QA-M5 — JodSa Investments M5 (AI Monthly Buy/Sell Planner), behavioral E2E against a
 * PRODUCTION build + live Supabase. This is the FIRST time any M5 UI is driven by anyone:
 * pm-desk's INVEST-M5 review is code+unit only (the dev hit a browser-automation env
 * problem), so every UI claim in it is source-read. This file carries that weight.
 *
 * Acceptance (roadmap M5 / SPEC-4): hand-computed fixture reproduces drift + top
 * concentration + a sensible buy/sell; deterministic per param_version; a balanced fixture
 * yields a clearly-rendered NO-TRADE; every suggested number carries an epistemic tag and
 * the disclaimer is visible; no order-execution path anywhere.
 *
 * The planner math is exhaustively unit-tested (tests/unit/invest/planner/*, 63/63) and
 * `plans` RLS is live-verified (rls.test.ts 33/33). This file covers only what those
 * cannot: the rendered pixels a user actually reads.
 *
 * ── Fixtures ───────────────────────────────────────────────────────────────────────
 * OWNER-LIKE (the M0-validation shape, `ownerFixture` below) — ฿100,000 total so every
 * direct weight is bigint-exact:
 *   VOO (etf/us_large_cap)          ฿42,500 → 42.5%
 *   NVDA (us_equity/us_tech_growth) ฿23,400 → 23.4%
 *   QA S&P feeder (custom thai_fund, classified us_large_cap)  ฿14,100 → 14.1%
 *   AMZN (us_equity)                ฿13,300 → 13.3%   [stands in for M0's GOOGL]
 *   MSFT (us_equity)                 ฿4,000 →  4.0%   [stands in for M0's ASML]
 *   gold bar (gold)                  ฿2,700 →  2.7%
 * Look-through: effective NVDA = 23.4 + (42.5 + 14.1) × 0.07 = 27.36% → renders 27.4%,
 * inside M0's hand-derived 26–29% band. Direct NVDA 23.4% is BELOW the 25% flag while
 * effective 27.4% is above it — the whole point of the feature.
 *
 * BALANCED (`balancedFixture`) — six classes at the default target, nothing concentrated:
 * NVDA/VOO/PTT/KFGG-A/gold/BTC at ฿16,700/16,700/16,700/16,600/16,700/16,600 = ฿100,000.
 *
 * Order-independence (heeds QA-M7-H1 / QA-M9-H1): every test resets its own invest rows
 * (incl. `plans`) in beforeEach and builds its own fixture.
 */

test.use({ storageState: STORAGE_A })

const FEEDER_NAME = 'QA S&P500 Feeder Fund'

let userIdA: string

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error('test user missing (userA)')
  userIdA = a.id
})

test.beforeEach(async () => {
  await resetInvestData(userIdA)
})

/** The M0-shaped concentrated portfolio. `classify: false` leaves the feeder unclassified. */
async function ownerFixture(page: Page, opts: { classify?: boolean } = {}): Promise<void> {
  await addHolding(page, { asset: '(VOO)', qty: '1', price: '42500', fx: '1' })
  await addHolding(page, { asset: '(NVDA)', qty: '1', price: '23400', fx: '1' })
  await addHolding(page, { asset: '(AMZN)', qty: '1', price: '13300', fx: '1' })
  await addHolding(page, { asset: '(MSFT)', qty: '1', price: '4000', fx: '1' })
  await addHolding(page, { asset: 'ทองคำแท่ง', qty: '1', price: '2700' })
  await addCustomHolding(page, {
    name: FEEDER_NAME,
    symbol: 'QASP500',
    assetClassLabel: 'กองทุนรวมไทย',
    currency: 'THB',
    qty: '1',
    price: '14100',
  })
  if (opts.classify !== false) {
    // Per M0: a Thai S&P-500 feeder is the same index as VOO, not diversification.
    await setAssetProxyClass(userIdA, FEEDER_NAME, 'us_large_cap')
  }
}

/** Six classes at the default target — zero drift, nothing concentrated. */
async function balancedFixture(page: Page): Promise<void> {
  await addHolding(page, { asset: '(NVDA)', qty: '1', price: '16700', fx: '1' })
  await addHolding(page, { asset: '(VOO)', qty: '1', price: '16700', fx: '1' })
  await addHolding(page, { asset: '(PTT)', qty: '1', price: '16700' })
  await addHolding(page, { asset: 'KFGG-A', qty: '1', price: '16600' })
  await addHolding(page, { asset: 'ทองคำแท่ง', qty: '1', price: '16700' })
  await addHolding(page, { asset: '(BTC)', qty: '1', price: '16600', fx: '1' })
}

/**
 * QA-M5-1 — THE highest-priority scenario (pm-desk: "the single most important UX judgment
 * in M5"). NO-TRADE must read as a first-class, complete, reassuring answer — NOT an empty
 * state and NOT a failure. So this asserts not just the badge but that the plan still
 * renders its full evidence (total value, drift table, stress, disclaimer) and that the
 * "no suggestions" line is a stated conclusion rather than a blank region.
 */
test('QA-M5-1 a balanced portfolio renders NO-TRADE as a first-class, complete outcome', async ({ page }) => {
  test.setTimeout(300_000)
  await balancedFixture(page)
  await openPlanTab(page)

  // Default target is already the even 6-way split the fixture matches; ฿3,000 new money
  // is prefilled — NO-TRADE must hold even WITH money available to deploy.
  await expect(page.locator('#newMoney')).toHaveValue('3000')
  await submitPlan(page)

  // 1. The verdict badge reads as a positive, definite answer.
  await expect(page.getByText('ไม่ต้องซื้อขาย (NO-TRADE)').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('มีคำแนะนำให้ดำเนินการ')).toHaveCount(0)

  // 2. The headline explains WHY it's fine — reassurance, not silence.
  await expect(page.getByText(/NO-TRADE — พอร์ตของคุณอยู่ในกรอบสัดส่วนเป้าหมาย/)).toBeVisible()

  // 3. It is NOT an empty state: the full evidence a user needs still renders.
  await expect(page.getByText(/มูลค่าพอร์ตที่ใช้คำนวณ/)).toBeVisible()
  await expect(page.getByText('100,000.00').first()).toBeVisible()
  await expect(page.getByText('ส่วนต่างจากเป้าหมาย (Drift)')).toBeVisible()
  await expect(page.getByText(/สถานการณ์จำลองความเสี่ยง/)).toBeVisible()
  await expect(page.getByText('คำแนะนำเดือนนี้')).toBeVisible()

  // 4. "No suggestions" is a stated conclusion, not a blank.
  await expect(page.getByText('ไม่มีคำแนะนำเฉพาะเจาะจง')).toBeVisible()

  // 5. The disclaimer is still there on the result.
  await expect(page.getByText('ข้อมูลประกอบการตัดสินใจเท่านั้น').first()).toBeVisible()

  // 6. It is saved as a real plan, not discarded as a non-event.
  await expect(page.getByText('ประวัติแผน')).toBeVisible()
  await expect(page.getByText('ยังไม่มีแผนที่สร้างไว้')).toHaveCount(0)
})

/**
 * QA-M5-2 — suggestions render with epistemic tags + amounts, all three action labels,
 * and the disclaimer stays visible. Also pins the M0 policy: new money never goes to a
 * flagged class, and NVDA lands on HOLD (M0's NO-SELL), not a manufactured sell.
 */
test('QA-M5-2 suggestions render with tags, amounts and buy/sell/hold labels', async ({ page }) => {
  test.setTimeout(300_000)
  await ownerFixture(page)
  await openPlanTab(page)
  await submitPlan(page)

  await expect(page.getByText('มีคำแนะนำให้ดำเนินการ').first()).toBeVisible({ timeout: 60_000 })

  const suggestions = page.locator('div.space-y-1\\.5.rounded-lg.border.p-3')
  await expect(suggestions).toHaveCount(5) // 3 buys + 1 sell (VOO) + 1 hold (NVDA)

  // All three action labels render.
  await expect(page.getByText('ซื้อเพิ่ม')).toHaveCount(3)
  await expect(page.getByText('ขาย / ลดสัดส่วน')).toHaveCount(1)
  await expect(page.getByText('ถือต่อ')).toHaveCount(1)

  // Every suggestion carries at least one epistemic tag badge (A4).
  for (let i = 0; i < 5; i++) {
    await expect(suggestions.nth(i).getByText(/^(FACT|CALC|INFER|JUDG|JUDG-PROXY|APPROX|Verify)$/).first()).toBeVisible()
  }

  // The BUYs steer new money to the underweight, NON-concentrated classes only — never
  // into etf/us_equity, the two flagged classes. This is M0's load-bearing action.
  const buyCards = suggestions.filter({ hasText: 'ซื้อเพิ่ม' })
  await expect(buyCards.filter({ hasText: 'หุ้นไทย (SET)' })).toHaveCount(1)
  await expect(buyCards.filter({ hasText: 'ทองคำ' })).toHaveCount(1)
  await expect(buyCards.filter({ hasText: 'คริปโต' })).toHaveCount(1)
  await expect(buyCards.filter({ hasText: 'ETF' })).toHaveCount(0)
  await expect(buyCards.filter({ hasText: 'หุ้นสหรัฐฯ' })).toHaveCount(0)

  // Each buy shows an amount, and the buys fully allocate the ฿3,000 with no leftover.
  const amounts: number[] = []
  for (let i = 0; i < 3; i++) {
    const txt = await buyCards.nth(i).locator('span.tabular-nums').innerText()
    const n = Number(txt.replace(/[^\d.]/g, ''))
    expect(n).toBeGreaterThan(0)
    amounts.push(n)
  }
  expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(3000, 2)

  // NVDA is HELD, not sold — M0's NO-SELL finding is the structural default.
  const holdCard = suggestions.filter({ hasText: 'ถือต่อ' })
  await expect(holdCard).toContainText('NVDA')
  // VOO is the sell — 42.5% direct AND its class +25.8pt over target.
  await expect(suggestions.filter({ hasText: 'ขาย / ลดสัดส่วน' })).toContainText('VOO')

  // Disclaimer persistently visible: once above the form, once on the result.
  await expect(page.getByText('ข้อมูลประกอบการตัดสินใจเท่านั้น')).toHaveCount(2)
  await expect(page.getByText(/คุณเป็นผู้ตรวจสอบและสั่งซื้อขายเองทั้งหมด/).first()).toBeVisible()
})

/**
 * QA-M5-3 — THE headline insight of the whole feature: effective look-through
 * concentration. With the owner-like fixture, effective NVDA must land in M0's 26–29%
 * band and must EXCEED its direct weight — i.e. the S&P double-counting reaches the
 * user's eyes. Direct 23.4% is under the 25% flag; effective 27.4% is over it.
 */
test('QA-M5-3 effective look-through concentration renders and exceeds the direct weight', async ({ page }) => {
  test.setTimeout(300_000)
  await ownerFixture(page)
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีคำแนะนำให้ดำเนินการ').first()).toBeVisible({ timeout: 60_000 })

  const directCard = page.locator('div.space-y-1\\.5').filter({ hasText: 'สัดส่วนสูงสุด (น้ำหนักเงินโดยตรง)' })
  const effectiveCard = page
    .locator('div.space-y-1\\.5')
    .filter({ hasText: 'สัดส่วนที่แท้จริงต่อหุ้นรายตัว (รวม Look-through)' })
  await expect(directCard).toBeVisible()
  await expect(effectiveCard).toBeVisible()

  // Direct NVDA 23.4% — below the 25% flag.
  const directNvda = directCard.locator('div').filter({ hasText: /^NVDA · NVIDIA Corporation/ })
  await expect(directNvda).toContainText('23.4%')

  // Effective NVDA 27.4% — M0's band (26–29%), and ABOVE the flag.
  const effNvda = effectiveCard.locator('div').filter({ hasText: /^NVDA · NVIDIA Corporation/ })
  await expect(effNvda).toContainText('27.4%')

  // The number a user reads is genuinely higher on the effective axis than the direct one.
  const directPct = Number((await directNvda.locator('span.tabular-nums').innerText()).replace('%', ''))
  const effPct = Number((await effNvda.locator('span.tabular-nums').innerText()).replace('%', ''))
  expect(effPct).toBeGreaterThan(directPct)
  expect(effPct).toBeGreaterThanOrEqual(26)
  expect(effPct).toBeLessThanOrEqual(29)

  // The ≥25% flag renders destructive on the effective row (but not the direct one).
  await expect(effNvda.locator('span.text-destructive')).toBeVisible()
  await expect(directNvda.locator('span.text-destructive')).toHaveCount(0)

  // The look-through hint marks it as a proxy, not real-time holdings data.
  await expect(page.getByText(/น้ำหนัก Look-through เป็นค่าประมาณ/)).toBeVisible()
  // Concentration block carries its epistemic tags.
  await expect(page.getByText('JUDG-PROXY').first()).toBeVisible()
})

/**
 * QA-M5-4 — the M0 guardrail at the rendered-pixel level: stress must be a RANGE, never a
 * false-precise single number. `stress.ts` computes a `pointEstimate`; the UI must never
 * render it.
 */
test('QA-M5-4 stress renders a range only, never a false-precise point estimate', async ({ page }) => {
  test.setTimeout(300_000)
  await ownerFixture(page)
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีคำแนะนำให้ดำเนินการ').first()).toBeVisible({ timeout: 60_000 })

  const stressCard = page.locator('div.space-y-2').filter({ hasText: 'สถานการณ์จำลองความเสี่ยง' }).first()
  await expect(stressCard).toBeVisible()
  // The heading itself disclaims it as illustrative, not a forecast.
  await expect(page.getByText(/สถานการณ์จำลองความเสี่ยง \(เพื่ออธิบาย ไม่ใช่การพยากรณ์\)/)).toBeVisible()

  const ranges = stressCard.locator('span.tabular-nums')
  const n = await ranges.count()
  expect(n).toBeGreaterThanOrEqual(1) // proxy-params.json ships 2 scenarios

  for (let i = 0; i < n; i++) {
    const txt = await ranges.nth(i).innerText()
    // Must be "{low}% ถึง {high}%" — two distinct bounds, never one bare number.
    expect(txt).toMatch(/^-?\d+\.\d+% ถึง -?\d+\.\d+%$/)
    const [low, high] = txt.split('ถึง').map((s) => Number(s.replace(/[^\d.-]/g, '')))
    expect(low).not.toBe(high) // a genuine band, not a collapsed point
    expect(low).toBeLessThan(high)
  }

  // Every stress row is tagged as proxy/approximate.
  await expect(stressCard.getByText('JUDG-PROXY').first()).toBeVisible()
  await expect(stressCard.getByText('APPROX').first()).toBeVisible()
})

/**
 * QA-M5-5 — the unclassified → classify flow. NOTE the corrected premise: the owner's own
 * 3 custom assets were classified by the orchestrator after pm-desk's brief was written
 * (live `unclassified = 0`), so this path can NOT be reproduced from the owner's account —
 * it needs a freshly-seeded unclassified custom asset, which `ownerFixture({classify:false})`
 * provides. The wall must read as GUIDANCE, not as an error.
 */
test('QA-M5-5 an unclassified custom asset blocks the plan with guidance, and classifying unblocks it', async ({ page }) => {
  test.setTimeout(300_000)
  await ownerFixture(page, { classify: false })
  await openPlanTab(page)
  await submitPlan(page)

  // Blocked — but as guidance: it names the asset and explains WHY it won't guess.
  await expect(page.getByText('มีสินทรัพย์ที่ต้องจัดประเภทก่อน')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/เครื่องมือนี้จะไม่เดาระดับความเสี่ยงของสินทรัพย์ — โปรดจัดประเภทก่อนสร้างแผน/)).toBeVisible()
  await expect(page.getByText(FEEDER_NAME).first()).toBeVisible()

  // No plan was persisted, and no half-rendered result leaked.
  await expect(page.getByText('ไม่ต้องซื้อขาย (NO-TRADE)')).toHaveCount(0)
  await expect(page.getByText('มีคำแนะนำให้ดำเนินการ')).toHaveCount(0)
  await expect(page.getByText('ยังไม่มีแผนที่สร้างไว้')).toBeVisible()

  // The classify picker is offered inline, right there — a way forward, not a dead end.
  const classifyForm = page.locator('form').filter({ hasText: FEEDER_NAME })
  await expect(classifyForm).toBeVisible()
  await classifyForm.getByRole('combobox').click()
  await page.getByRole('option', { name: 'หุ้นสหรัฐฯ ขนาดใหญ่ / ดัชนีกว้าง', exact: true }).click()
  await classifyForm.getByRole('button', { name: 'บันทึกการจัดประเภท' }).click()
  await expect(page.getByText('จัดประเภทแล้ว')).toBeVisible({ timeout: 30_000 })

  // Classifying unblocks: the same button now produces a plan.
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีคำแนะนำให้ดำเนินการ').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('มีสินทรัพย์ที่ต้องจัดประเภทก่อน')).toHaveCount(0)
})

/**
 * QA-M5-6 — the plan persists to history and reads back with identical numbers (the
 * stored `outputs` jsonb rendered verbatim, no recompute drift — same pattern as M3's
 * snapshots), and `plans` exposes no edit path in the UI (immutable by policy: 0009 ships
 * select/insert/delete only).
 */
test('QA-M5-6 a plan persists to history and reads back without drift; no edit path exists', async ({ page }) => {
  test.setTimeout(300_000)
  await ownerFixture(page)
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีคำแนะนำให้ดำเนินการ').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('100,000.00').first()).toBeVisible()

  // Reload the app fresh, reopen the Plan tab, open the plan from history.
  await openPlanTab(page)
  await expect(page.getByText('ประวัติแผน')).toBeVisible()
  const historyRow = page.locator('button').filter({ hasText: 'มีคำแนะนำให้ดำเนินการ' }).first()
  await historyRow.click()

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  // Same numbers, rendered from the persisted jsonb — no recompute.
  await expect(sheet.getByText('100,000.00').first()).toBeVisible()
  await expect(sheet.getByText('27.4%').first()).toBeVisible()
  await expect(sheet.getByText('23.4%').first()).toBeVisible()
  await expect(sheet.getByText('ซื้อเพิ่ม')).toHaveCount(3)
  await expect(sheet.getByText('ขาย / ลดสัดส่วน')).toHaveCount(1)
  await expect(sheet.getByText('ถือต่อ')).toHaveCount(1)
  // The disclaimer travels with the persisted plan.
  await expect(sheet.getByText('ข้อมูลประกอบการตัดสินใจเท่านั้น')).toBeVisible()

  // Immutability at the UI layer: a historical plan is read-only — no edit/save/delete
  // affordance anywhere in the detail sheet.
  await expect(sheet.getByRole('button', { name: /แก้ไข|บันทึก|ลบ/ })).toHaveCount(0)
  await expect(sheet.locator('input')).toHaveCount(0)
})

/** QA-M5-7 — target allocation must sum to 100%; a set that doesn't is refused clearly. */
test('QA-M5-7 a target allocation that does not sum to 100% is rejected with a clear message', async ({ page }) => {
  test.setTimeout(300_000)
  await balancedFixture(page)
  await openPlanTab(page)

  const generate = page.getByRole('button', { name: 'สร้างแผน', exact: true })
  await expect(generate).toBeEnabled() // default target already sums to 100

  // Break it: 6 × 10% = 60%.
  await setTargetAllocation(page, {
    us_equity: 10, etf: 10, thai_set: 10, thai_fund: 10, gold: 10, crypto: 10,
  })
  await expect(page.getByText('ต้องรวมเป็น 100% (ตอนนี้รวม 60%)')).toBeVisible()
  await expect(generate).toBeDisabled() // cannot even submit an invalid target

  // Overshoot is refused too.
  await setTargetAllocation(page, {
    us_equity: 30, etf: 30, thai_set: 30, thai_fund: 30, gold: 30, crypto: 30,
  })
  await expect(page.getByText('ต้องรวมเป็น 100% (ตอนนี้รวม 180%)')).toBeVisible()
  await expect(generate).toBeDisabled()

  // Fix it → the warning clears and the plan generates.
  await setTargetAllocation(page, {
    us_equity: 20, etf: 20, thai_set: 20, thai_fund: 20, gold: 10, crypto: 10,
  })
  // NB: match on "ตอนนี้รวม" (warning-only) — the static hint above the inputs also
  // contains the literal "ต้องรวมเป็น 100%", so that phrase can never assert absence.
  await expect(page.getByText(/ตอนนี้รวม/)).toHaveCount(0)
  await expect(generate).toBeEnabled()
  await submitPlan(page)
  await expect(page.getByText(/ไม่ต้องซื้อขาย \(NO-TRADE\)|มีคำแนะนำให้ดำเนินการ/).first()).toBeVisible({
    timeout: 60_000,
  })
})

/**
 * QA-M5-8 — the Plan tab in English + dark theme. The disclaimer (a hard M5 constraint on
 * a financial-advice surface) must be present in BOTH locales, idle AND on the result.
 */
test('QA-M5-8 the Plan tab renders in English and in dark theme, disclaimer intact', async ({ page }) => {
  test.setTimeout(300_000)
  await balancedFixture(page)

  // Dark theme.
  await page.goto('/invest')
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await openPlanTab(page)
  await expect(page.getByText('ข้อมูลประกอบการตัดสินใจเท่านั้น')).toBeVisible()

  // Switch to English; confirm the app-wide re-render first, then the Plan tab.
  await page.goto('/settings')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 15_000 })

  await page.goto('/invest')
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(page.getByText('Target allocation')).toBeVisible()
  // Disclaimer in English, while idle (before any plan exists).
  await expect(page.getByText('Decision-support only')).toBeVisible()
  await expect(page.getByText(/You review and place any trade yourself — this tool never places or simulates an order/)).toBeVisible()

  await page.getByRole('button', { name: 'Generate Plan', exact: true }).click()
  await expect(page.getByText('NO-TRADE', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/your portfolio is within its target allocation bands/)).toBeVisible()
  await expect(page.getByText('No specific suggestions.')).toBeVisible()
  await expect(page.getByText(/Stress scenarios \(illustrative, not a forecast\)/)).toBeVisible()
  // Disclaimer still present on the result, in English — idle + result, both locales.
  await expect(page.getByText('Decision-support only')).toHaveCount(2)

  // Restore Thai for the rest of the suite (cookie-based, same storage state).
  await page.goto('/settings')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'ไทย' }).click()
  await expect(page.getByRole('heading', { name: 'ตั้งค่า' })).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() => localStorage.setItem('theme', 'light'))
})

/**
 * QA-M5-9 — the non-goal guard, observed on the wire rather than by grep. Generating a
 * plan must produce no request that resembles an order/trade/broker call. pm-desk proved
 * no execution sink exists in the source; this proves nothing sneaks out at runtime.
 */
test('QA-M5-9 generating a plan issues no order/trade/broker-shaped network call', async ({ page }) => {
  test.setTimeout(300_000)
  await ownerFixture(page)

  const suspicious: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (/order|trade|broker|execute|alpaca|binance|ccxt|interactive-?brokers/i.test(url)) {
      suspicious.push(`${req.method()} ${url}`)
    }
  })

  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีคำแนะนำให้ดำเนินการ').first()).toBeVisible({ timeout: 60_000 })

  expect(suspicious, `order/trade-shaped requests fired: ${suspicious.join(', ')}`).toEqual([])
})
