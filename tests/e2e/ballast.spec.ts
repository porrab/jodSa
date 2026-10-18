import { test, expect, type Page, type Locator } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../lib/supabase/types'
import { env, STORAGE_A, STORAGE_B } from './helpers/env'
import { resetInvestData } from './helpers/admin'
import { addHolding, addCustomHolding, openOverview, updatePrice, openPlanTab, submitPlan } from './helpers/invest'

/**
 * SPEC-6 / QA-INVEST-2 — synthetic QA accounts only; real UI/actions/PostgREST.
 * PREREQUISITE: an explicitly approved target DB must have the reviewed
 * db/migrations/0010_invest_ballast_sleeve.sql applied BEFORE this spec or its
 * Playwright setup is executed. Authoring/tsc does not authorize DB writes.
 * The existing setup uses .env.local + .env.test and resets designated QA users.
 * Never point it at owner credentials. No migration is applied by this spec.
 * Missing migration/auth/data contracts FAIL; there are no automatic skips.
 *
 * Source preparation on 2026-10-18: browser/database execution still pending
 * migration authorization. These assertions are not evidence of a passing run.
 * Admin access is restricted to the existing QA reset helper. Reads and all
 * behavior assertions use real user sessions; no mocked actions or render data.
 */

test.use({ storageState: STORAGE_A })

function userClient() {
  return createClient<Database>(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
let clientA: ReturnType<typeof userClient>
let clientB: ReturnType<typeof userClient>
let userIdA: string
let userIdB: string

test.beforeAll(async () => {
  clientA = userClient()
  clientB = userClient()
  const a = await clientA.auth.signInWithPassword(env.userA)
  const b = await clientB.auth.signInWithPassword(env.userB)
  if (a.error || !a.data.user || b.error || !b.data.user) {
    throw new Error('SPEC-6 requires both configured QA user sessions')
  }
  userIdA = a.data.user.id
  userIdB = b.data.user.id
  expect(userIdA, 'two genuinely distinct QA identities are required').not.toBe(userIdB)
})

test.beforeEach(async () => {
  await resetInvestData(userIdA)
})

test.afterAll(async () => {
  if (clientA) await clientA.auth.signOut()
  if (clientB) await clientB.auth.signOut()
})

const copy = {
  th: {
    add: 'เพิ่มสินทรัพย์', edit: 'แก้ไข', save: 'บันทึก', role: 'บทบาทในพอร์ต',
    sleeves: ['หลัก (Core)', 'ตัวถ่วง (Ballast)', 'เสริม (Satellite)', 'เงินเสี่ยงสูง (Risk Capital)'],
    helper: 'ส่วนที่คุณกำหนดให้ช่วยถ่วงความผันผวนของพอร์ต ไม่ได้หมายความว่าไม่มีความเสี่ยง',
    warning: 'เงินก้อนนี้เสี่ยงสูญเสียได้ทั้งหมด 100% — แยกจากเงินลงทุนหลัก',
  },
  en: {
    add: 'Add Holding', edit: 'Edit', save: 'Save', role: 'Portfolio role',
    sleeves: ['Core', 'Ballast', 'Satellite', 'Risk Capital'],
    helper: 'The part you assign to help stabilize the portfolio; this does not mean it is risk-free.',
    warning: 'This capital is 100% losable — kept separate from core investing capital.',
  },
} as const
type Locale = keyof typeof copy

async function setLocale(page: Page, locale: Locale) {
  await page.goto('/settings')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: locale === 'th' ? 'ไทย' : 'English', exact: true }).click()
  await expect(page.getByRole('heading', { name: locale === 'th' ? 'ตั้งค่า' : 'Settings', exact: true })).toBeVisible()
}

async function checkOptions(page: Page, form: Locator, locale: Locale) {
  await expect(form.getByText(copy[locale].role, { exact: true })).toBeVisible()
  await form.getByRole('combobox').click()
  await expect(page.getByRole('option')).toHaveText([...copy[locale].sleeves])
  await page.keyboard.press('Escape')
}

async function selectSleeve(page: Page, form: Locator, label: string) {
  await form.getByRole('combobox').click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

async function editHolding(page: Page, name: string, locale: Locale = 'th') {
  await page.goto('/invest')
  await page.getByRole('button', { name }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: copy[locale].edit, exact: true }).click()
  await expect(sheet.locator('#e-broker')).toBeVisible()
  return sheet
}

async function readHoldings() {
  const result = await clientA.from('holdings').select('*').eq('user_id', userIdA).order('id')
  expect(result.error).toBeNull()
  expect(result.data).not.toBeNull()
  return result.data!
}

async function readLedger(holdingId: string) {
  const result = await clientA.from('asset_transactions').select('*').eq('holding_id', holdingId).order('id')
  expect(result.error).toBeNull()
  expect(result.data).not.toBeNull()
  return result.data!
}

async function readSnapshots() {
  const result = await clientA.from('portfolio_snapshots').select('*').eq('user_id', userIdA).order('taken_at')
  expect(result.error).toBeNull()
  expect(result.data).not.toBeNull()
  return result.data!
}

async function saveSnapshot(page: Page) {
  const before = await readSnapshots()
  await page.getByRole('button', { name: 'บันทึกสแนปช็อต', exact: true }).click()
  await expect.poll(async () => (await readSnapshots()).length).toBe(before.length + 1)
  const after = await readSnapshots()
  return after.find((row) => !before.some((old) => old.id === row.id))!
}

for (const locale of ['th', 'en'] as const) {
  test(`SPEC6-UI-${locale} four ordered roles, contextual helper, create/edit/reload and risk warning`, async ({ page }) => {
    test.setTimeout(240_000)
    await setLocale(page, locale)
    const text = copy[locale]
    await page.goto('/invest')
    await page.getByRole('button', { name: text.add, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox').first().click()
    await page.getByRole('option', { name: '(PTT)' }).click()
    const form = dialog.locator('form')
    await expect(form.getByRole('combobox')).toHaveText(text.sleeves[0])
    await checkOptions(page, form, locale)
    await expect(form.getByText(text.helper, { exact: true })).toHaveCount(0)
    await selectSleeve(page, form, text.sleeves[3])
    await expect(form.getByText(text.warning, { exact: true })).toBeVisible()
    await selectSleeve(page, form, text.sleeves[1])
    await expect(form.getByText(text.helper, { exact: true })).toBeVisible()
    await expect(form.getByText(text.warning, { exact: true })).toHaveCount(0)
    await dialog.locator('#h-qty').fill('2')
    await dialog.locator('#h-price').fill('100')
    await dialog.locator('#h-datetime').fill('2025-05-15T14:30')
    await dialog.getByRole('button', { name: text.add, exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await page.reload()
    const row = page.getByRole('button', { name: 'ปตท. จำกัด (มหาชน)' })
    await expect(row).toContainText(text.sleeves[1])
    expect((await readHoldings()).map((h) => h.sleeve)).toEqual(['ballast'])

    const sheet = await editHolding(page, 'ปตท. จำกัด (มหาชน)', locale)
    const editForm = sheet.locator('form')
    await expect(editForm.getByRole('combobox')).toHaveText(text.sleeves[1])
    await expect(editForm.getByText(text.helper, { exact: true })).toBeVisible()
    await checkOptions(page, editForm, locale)
    await selectSleeve(page, editForm, text.sleeves[2])
    await expect(editForm.getByText(text.helper, { exact: true })).toHaveCount(0)
    await selectSleeve(page, editForm, text.sleeves[3])
    await expect(editForm.getByText(text.warning, { exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: text.save, exact: true }).click()
    await expect(sheet.locator('form')).toHaveCount(0)
    await page.reload()
    await page.getByRole('button', { name: 'ปตท. จำกัด (มหาชน)' }).click()
    await expect(page.getByRole('dialog').getByText(text.warning, { exact: true })).toBeVisible()
    expect((await readHoldings())[0].sleeve).toBe('risk_capital')
  })
}

test('SPEC6-ALLOCATION persisted 60/20/10/10 retains same-asset sleeve split and merged concentration', async ({ page }) => {
  test.setTimeout(300_000)
  await setLocale(page, 'th')
  // Same PTT asset in all four sleeves: asset grouping must not collapse sleeve grouping.
  for (const [index, value] of [600, 200, 100, 100].entries()) {
    await addHolding(page, { asset: '(PTT)', sleeve: copy.th.sleeves[index], qty: '1', price: String(value) })
  }
  const holdings = await readHoldings()
  expect(holdings).toHaveLength(4)
  expect(new Set(holdings.map((h) => h.asset_id)).size).toBe(1)
  expect(holdings.map((h) => h.sleeve).sort()).toEqual(['ballast', 'core', 'risk_capital', 'satellite'])
  await openOverview(page)
  await expect(page.locator('.text-2xl').first()).toContainText('1,000.00')
  await expect(page.getByText('ปตท. จำกัด (มหาชน)', { exact: true })).toHaveCount(1)
  await expect(page.getByText('100.0%', { exact: true })).toBeVisible()
  const chart = page.getByText('แบ่งตามบทบาทในพอร์ต', { exact: true }).locator('..')
  for (const label of copy.th.sleeves) await expect(chart.getByText(label, { exact: true })).toBeVisible()
  const snapshot = await saveSnapshot(page)
  expect(snapshot.totals).toMatchObject({ valueMinor: '100000', costMinor: '100000', pnlMinor: '0' })
  expect(snapshot.allocation).toMatchObject({ sleeve: expect.arrayContaining([
    { key: 'core', valueMinor: '60000', pct: 60 },
    { key: 'ballast', valueMinor: '20000', pct: 20 },
    { key: 'satellite', valueMinor: '10000', pct: 10 },
    { key: 'risk_capital', valueMinor: '10000', pct: 10 },
  ]) })
  await openOverview(page)
  await page.getByRole('button', { name: /1,000\.00/ }).click()
  const sheet = page.getByRole('dialog')
  for (const [index, pct] of [60, 20, 10, 10].entries()) {
    await expect(sheet.getByText(copy.th.sleeves[index], { exact: true }).locator('..')).toContainText(`${pct}.0%`)
  }
})

test('SPEC6-EDIT core to ballast preserves broker, ledger, quantity, nonzero valuation/FX/cost/P&L; cancel saves nothing', async ({ page }) => {
  test.setTimeout(240_000)
  await setLocale(page, 'th')
  await addHolding(page, { asset: '(AAPL)', qty: '3', price: '100', fees: '2', fx: '35' })
  // Set a nonempty broker through the editor before taking the baseline.
  let sheet = await editHolding(page, 'Apple Inc.')
  await sheet.locator('#e-broker').fill('QA ballast broker')
  await sheet.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(sheet.locator('form')).toHaveCount(0)
  await openOverview(page)
  await updatePrice(page, { asset: 'Apple Inc.', value: '450', fx: '36' })
  const before = (await readHoldings())[0]
  expect(before.sleeve).toBe('core')
  expect(before.broker).toBe('QA ballast broker')
  expect(Number(before.current_value_minor)).toBe(45000)
  expect(Number(before.current_fx_to_display)).toBe(36)
  const ledger = await readLedger(before.id)
  expect(ledger).toHaveLength(1)
  expect(Number(ledger[0].qty)).toBe(3)
  const snapshotBefore = await saveSnapshot(page)
  expect(snapshotBefore.totals).toMatchObject({ valueMinor: '1620000', costMinor: '1057000', pnlMinor: '563000' })

  sheet = await editHolding(page, 'Apple Inc.')
  await selectSleeve(page, sheet.locator('form'), copy.th.sleeves[1])
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  expect((await readHoldings())[0]).toEqual(before)

  sheet = await editHolding(page, 'Apple Inc.')
  await selectSleeve(page, sheet.locator('form'), copy.th.sleeves[1])
  await sheet.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(sheet.locator('form')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Apple Inc.' })).toContainText(copy.th.sleeves[1])
  const after = (await readHoldings())[0]
  expect(after).toEqual({ ...before, sleeve: 'ballast', updated_at: after.updated_at })
  expect(await readLedger(before.id)).toEqual(ledger)
  await openOverview(page)
  await expect(page.locator('.text-2xl').first()).toContainText('16,200.00')
  await expect(page.getByText(/กำไร\/ขาดทุน.*5,630\.00/)).toBeVisible()
  const snapshotAfter = await saveSnapshot(page)
  expect(snapshotAfter.totals).toEqual(snapshotBefore.totals)
  expect((await readSnapshots()).find((s) => s.id === snapshotBefore.id)).toEqual(snapshotBefore)
})

test('SPEC6-HISTORY real old missing-sleeve and new ballast snapshots render after reload', async ({ page }) => {
  test.setTimeout(240_000)
  await setLocale(page, 'th')
  // Historical JSON genuinely lacks the sleeve property. Store it under A via RLS,
  // then navigate the actual history UI; constructing this object alone is no proof.
  const historical = {
    user_id: userIdA, taken_at: '2025-01-01T00:00:00Z', display_currency: 'THB', holdings: [],
    totals: { valueMinor: '12300', costMinor: '10000', pnlMinor: '2300', pricedCount: 1, unpricedCount: 0, excludedCount: 0, currency: 'THB' },
    allocation: { assetClass: [{ key: 'thai_set', valueMinor: '12300', pct: 100 }], currency: [{ key: 'THB', valueMinor: '12300', pct: 100 }] },
  }
  const old = await clientA.from('portfolio_snapshots').insert(historical).select('*').single()
  expect(old.error).toBeNull()
  expect(old.data).not.toBeNull()
  await addHolding(page, { asset: '(PTT)', sleeve: copy.th.sleeves[1], qty: '2', price: '100' })
  await openOverview(page)
  const current = await saveSnapshot(page)
  expect(current.allocation).toMatchObject({ sleeve: [{ key: 'ballast', valueMinor: '20000', pct: 100 }] })
  await openOverview(page)
  await page.getByRole('button', { name: /123\.00/ }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.locator('.text-2xl')).toContainText('123.00')
  await expect(sheet.getByText(/ต้นทุนรวม.*100\.00/)).toBeVisible()
  await expect(sheet.getByText(/กำไร\/ขาดทุน.*23\.00/)).toBeVisible()
  await expect(sheet.getByText('หุ้นไทย (SET)', { exact: true })).toBeVisible()
  await expect(sheet.getByText('แบ่งตามบทบาทในพอร์ต', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: /200\.00/ }).click()
  await expect(sheet.getByText('แบ่งตามบทบาทในพอร์ต', { exact: true })).toBeVisible()
  await expect(sheet.getByText(copy.th.sleeves[1], { exact: true }).locator('..')).toContainText('100.0%')
  expect((await readSnapshots()).find((s) => s.id === old.data!.id)).toEqual(old.data)
})

test('SPEC6-PLANNER active unclassified ballast still blocks planning through the real action', async ({ page }) => {
  test.setTimeout(240_000)
  await setLocale(page, 'th')
  const name = 'QA Unclassified Ballast'
  await addCustomHolding(page, { name, assetClassLabel: 'กองทุนรวมไทย', currency: 'THB', qty: '5', price: '100' })
  const sheet = await editHolding(page, name)
  await selectSleeve(page, sheet.locator('form'), copy.th.sleeves[1])
  await sheet.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(sheet.locator('form')).toHaveCount(0)
  const holding = (await readHoldings())[0]
  expect(holding.sleeve).toBe('ballast')
  expect(Number((await readLedger(holding.id))[0].qty)).toBe(5)
  const asset = await clientA.from('assets').select('proxy_class').eq('id', holding.asset_id).single()
  expect(asset.error).toBeNull()
  expect(asset.data?.proxy_class).toBeNull()
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีสินทรัพย์ที่ต้องจัดประเภทก่อน', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('form').filter({ hasText: name }).getByRole('combobox')).toBeVisible()
  await expect(page.getByText('ยังไม่มีแผนที่สร้างไว้', { exact: true })).toBeVisible()
  const plans = await clientA.from('plans').select('id').eq('user_id', userIdA)
  expect(plans.error).toBeNull()
  expect(plans.data).toEqual([])
})

test('SPEC6-RLS B cannot read/update/delete A ballast or forge ownership; A row and ledger survive', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await resetInvestData(userIdB)
  await setLocale(page, 'th')
  await addHolding(page, { asset: '(PTT)', sleeve: copy.th.sleeves[1], qty: '2', price: '100' })
  const original = (await readHoldings())[0]
  const ledger = await readLedger(original.id)
  // A's real UPDATE succeeds, so a blanket-deny policy cannot false-pass the negatives.
  const positive = await clientA.from('holdings').update({ broker: 'QA A positive control' }).eq('id', original.id).select('*').single()
  expect(positive.error).toBeNull()
  expect(positive.data?.broker).toBe('QA A positive control')
  const before = positive.data!
  const read = await clientB.from('holdings').select('id').eq('id', before.id)
  expect(read.error).toBeNull()
  expect(read.data).toEqual([])
  const update = await clientB.from('holdings').update({ sleeve: 'core', broker: 'QA B forbidden' }).eq('id', before.id).select('id')
  expect(update.error).toBeNull()
  expect(update.data).toEqual([])
  const deletion = await clientB.from('holdings').delete().eq('id', before.id).select('id')
  expect(deletion.error).toBeNull()
  expect(deletion.data).toEqual([])
  const forged = await clientB.from('holdings').insert({ user_id: userIdA, asset_id: before.asset_id, sleeve: 'ballast' })
  expect(forged.error?.code).toBe('42501')
  expect(await readHoldings()).toEqual([before])
  expect(await readLedger(before.id)).toEqual(ledger)
  // B's own ballast INSERT is permitted, proving ballast itself isn't rejected.
  const own = await clientB.from('holdings').insert({ user_id: userIdB, asset_id: before.asset_id, sleeve: 'ballast', broker: 'QA B positive control' }).select('id').single()
  expect(own.error).toBeNull()
  expect(own.data).not.toBeNull()
  const contextB = await browser.newContext({ storageState: STORAGE_B })
  try {
    const pageB = await contextB.newPage()
    await pageB.goto('/invest')
    await expect(pageB.getByRole('button', { name: 'ปตท. จำกัด (มหาชน)' })).toHaveCount(1)
    await pageB.getByRole('button', { name: 'ปตท. จำกัด (มหาชน)' }).click()
    await expect(pageB.getByRole('dialog').getByText('QA A positive control', { exact: true })).toHaveCount(0)
    await expect(pageB.getByRole('dialog').getByText('QA B positive control', { exact: true })).toBeVisible()
  } finally {
    await contextB.close()
    const cleanup = await clientB.from('holdings').delete().eq('id', own.data!.id)
    expect(cleanup.error).toBeNull()
  }
})
