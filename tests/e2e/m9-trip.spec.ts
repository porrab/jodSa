import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, adminClient, resetAllUserData, seedAccount } from './helpers/admin'
import {
  seedTripSession, deleteTripSession, clearOwnerSessions,
  apiCtx, joinTrip, addExpense, sendTripSlip,
  ensureSwitchOn, clickUntilVisible, type SeededTrip,
} from './helpers/trip'

/**
 * QA-M9 — Trip rework (design v3 J5), production build.
 *
 * Full journey through the owner's in-app management view:
 *   create trip → 3 members → 2 bills → ledger "ใครติดใคร เท่าไหร่" correct
 *   (reuses M6 perHead settlement math) → settle (a share is paid) → mark paid
 *   (owner confirms the slip) → ปิดทริป. Guest /pay/<token> stays
 *   "recorded, not verified".
 *
 * Seeding uses the REAL anon API routes (join/expense/slip) exactly as guests
 * hit them — the token + RLS + payer-server-resolution stack stays exercised;
 * the owner's จดบิล, confirm, and close all go through the rendered UI.
 *
 * Ledger expectation (computeTripDebts, lib/trip.ts — per debtor→payer pair):
 *   Bill1 ค่าอาหาร ฿900 paid by OWNER, split 3 → each other owes ฿300
 *   Bill2 ค่าที่พัก ฿600 paid by บี, split 3 → each other owes ฿200
 *   ⇒ บี→owner ฿300 · ซี→owner ฿300 · owner→บี ฿200 · ซี→บี ฿200
 *   After บี pays their ฿300 share toward Bill1 and owner confirms ⇒ บี→owner clears.
 */

test.describe.configure({ mode: 'serial' })

let trip: SeededTrip
let bToken = ''
let cToken = ''

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  // Order-independence (QA-M7-H1): give user A a known account so the zero-account
  // first-run FirstAccountSheet does NOT auto-open over the trip page and swallow
  // clicks (it would if a prior test left the user at zero accounts).
  await resetAllUserData(a.id)
  await seedAccount(a.id, 'เงินสด', 'KBank')
  await clearOwnerSessions(a.id)
  trip = await seedTripSession(a.id, 'QA-M9 ทริปทะเล') // owner auto-joined ("เจ้าของทริป")

  // Two guests join → 3 members total (owner + บี + ซี).
  const api = await apiCtx('203.0.113.71')
  const b = await joinTrip(api, trip.token, 'บี'); expect(b.status).toBe(201); bToken = b.participantToken!
  const c = await joinTrip(api, trip.token, 'ซี'); expect(c.status).toBe(201); cToken = c.participantToken!
  // Bill 2: paid by บี (Bill 1 is created through the owner UI in the test).
  const e2 = await addExpense(api, trip.token, bToken, { title: 'ค่าที่พัก', amountSatang: 60000, split: 3 })
  expect(e2.status).toBe(201)
  await api.dispose()
})

test.afterAll(async () => { if (trip) await deleteTripSession(trip.token) })

test('M9-trip guest pay page stays recorded-not-verified', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`/pay/${trip.token}`)
  // The trip guest flow surfaces the "recorded, not verified" trust note.
  await expect(page.getByText('ไม่ได้ตรวจสอบกับธนาคาร', { exact: false })).toBeVisible()
  await ctx.close()
})

test('M9-trip owner: 3 members, จดบิล, ledger correct, settle+mark-paid, ปิดทริป', async ({ browser }) => {
  test.setTimeout(180_000)
  const ctx = await browser.newContext({ storageState: STORAGE_A })
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept())

  await page.goto(`/sessions/${trip.token}`)
  await page.waitForLoadState('networkidle')
  // Defensive: an account is seeded so this shouldn't appear, but never let the
  // first-run sheet overlay the trip flow.
  const firstRun = page.getByText('สร้างบัญชีแรกของคุณ', { exact: true })
  if (await firstRun.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await expect(firstRun).toBeHidden()
  }

  // 3 members shown; ledger card ("ใครติดใคร") is the focal element.
  await expect(page.getByText('สมาชิก 3 คน')).toBeVisible()
  await expect(page.getByText('ใครติดใคร', { exact: true })).toBeVisible()

  // Owner logs Bill 1 through the จดบิล flow (payer resolved server-side = owner).
  await page.getByRole('button', { name: 'จดบิล', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('ชื่อรายการ').fill('ค่าอาหาร')
  await sheet.getByLabel('ยอดที่จ่ายไป (บาท)').fill('900')
  await sheet.getByLabel('หารกี่คน').fill('3')
  await sheet.getByRole('button', { name: 'บันทึกรายการ' }).click()
  await expect(page.getByText('เพิ่มรายการแล้ว')).toBeVisible()

  // Ledger now reflects both bills. Assert the debtor→payer lines + M6 perHead amounts.
  await page.reload()
  await page.waitForLoadState('networkidle')
  const ledger = page.locator('div').filter({ has: page.getByText('ใครติดใคร', { exact: true }) }).first()
  await expect(page.getByText('บี ติด เจ้าของทริป')).toBeVisible()
  await expect(page.getByText('ซี ติด เจ้าของทริป')).toBeVisible()
  await expect(page.getByText('เจ้าของทริป ติด บี')).toBeVisible()
  await expect(ledger).toContainText('300.00') // per-head of Bill 1 (฿900/3)
  await expect(ledger).toContainText('200.00') // per-head of Bill 2 (฿600/3)

  // SETTLE: บี pays their ฿300 share toward Bill 1 (the owner's expense).
  const { data: bill1 } = await adminClient()
    .from('session_expenses').select('id').eq('session_id', trip.token).eq('title', 'ค่าอาหาร').single()
  const api = await apiCtx('203.0.113.72')
  expect(await sendTripSlip(api, trip.token, {
    participantToken: bToken, expenseId: bill1!.id, amountSatang: 30000, refCode: 'M9TRIP-B1',
  })).toBe(201)
  await api.dispose()

  // MARK PAID: owner confirms บี's slip on the ค่าอาหาร expense (payer-only toggle).
  await page.reload()
  await page.waitForLoadState('networkidle')
  const confirmSwitch = page.getByRole('switch', { name: 'ยืนยันสลิป' })
  await expect(confirmSwitch).toBeVisible()
  await ensureSwitchOn(confirmSwitch) // defeat a swallowed first click (prod hydration)

  // Ledger recomputes: บี's debt to the owner clears; ซี's remains.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('บี ติด เจ้าของทริป')).toHaveCount(0)
  await expect(page.getByText('ซี ติด เจ้าของทริป')).toBeVisible()

  // ปิดทริป → wait for the in-place status flip (setSessionStatus revalidates)
  // before reloading, so the reload can't race the in-flight close action.
  await clickUntilVisible(
    page.getByRole('button', { name: 'ปิดทริป', exact: true }),
    page.getByRole('button', { name: 'เปิดทริปอีกครั้ง', exact: true }),
  )
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('ปิดแล้ว', { exact: true })).toBeVisible()

  await ctx.close()
})
