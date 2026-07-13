import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, adminClient } from './helpers/admin'
import {
  seedTripSession, deleteTripSession, clearOwnerSessions, apiCtx,
  joinTrip, addExpense, sendTripSlip, adminSlipsForExpense,
  ensureSwitchOn, clickUntilVisible, type SeededTrip,
} from './helpers/trip'

/**
 * TRIP-5 — the owner participates in the ledger through the in-app management
 * view (embedded TripClient, seeded identity, no join step): adds an expense,
 * sends a slip toward another participant's expense, and confirms a slip on their
 * own expense. Owner can close (which gates all anon writes), reopen, and delete.
 */

test.describe.configure({ mode: 'serial' })

let trip: SeededTrip
let bToken = ''
let bExpenseId = '' // an expense fronted by guest B (the owner owes a share of it)

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  await clearOwnerSessions(a.id)
  trip = await seedTripSession(a.id, 'QA-TRIP-5 ทริปเหนือ')

  const api = await apiCtx('198.51.100.30')
  const b = await joinTrip(api, trip.token, 'บี'); expect(b.status).toBe(201); bToken = b.participantToken!
  const e = await addExpense(api, trip.token, bToken, { title: 'ค่าน้ำมัน', amountSatang: 60000, split: 3 })
  expect(e.status).toBe(201); bExpenseId = e.expenseId!
  await api.dispose()
})

test.afterAll(async () => { if (trip) await deleteTripSession(trip.token) })

test('TRIP-5 owner acts in-app (add / send / confirm) then close-gates anon, reopen, delete', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: STORAGE_A })
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept()) // accept the delete confirm()

  await page.goto(`/sessions/${trip.token}`)
  // Prod-build hydration guard: let the client components hydrate before any
  // interaction, else the first click can be swallowed (matches m9-trip's pattern).
  await page.waitForLoadState('networkidle')
  // Owner management view: seeded as a participant (no join form), owner controls present.
  await expect(page.getByRole('heading', { name: 'เข้าร่วมทริป' })).toBeHidden()
  await expect(page.getByText('ลิงก์สำหรับเพื่อน')).toBeVisible()
  await expect(page.getByText('รายการในทริป')).toBeVisible()

  // Owner fronts their own expense through the embedded sheet.
  // M9 (design v3, J5): the add-expense trigger was renamed to "จดบิล".
  await page.getByRole('button', { name: 'จดบิล', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('ชื่อรายการ').fill('ค่าทางด่วน')
  await sheet.getByLabel('ยอดที่จ่ายไป (บาท)').fill('300')
  await sheet.getByLabel('หารกี่คน').fill('3')
  await page.getByRole('button', { name: 'บันทึกรายการ' }).click()
  await expect(page.getByText('เพิ่มรายการแล้ว')).toBeVisible()

  // A slip arrives toward the OWNER's expense → owner confirms it (payer-only).
  const { data: ownerExp } = await adminClient()
    .from('session_expenses').select('id').eq('session_id', trip.token).eq('title', 'ค่าทางด่วน').single()
  const api = await apiCtx('198.51.100.31')
  expect(await sendTripSlip(api, trip.token, { participantToken: bToken, expenseId: ownerExp!.id, amountSatang: 10000, refCode: 'TRIP5-OWNED' })).toBe(201)
  await api.dispose()

  await page.reload()
  await page.waitForLoadState('networkidle')
  const confirmSwitch = page.getByRole('switch', { name: 'ยืนยันสลิป' })
  await expect(confirmSwitch).not.toBeChecked()
  await ensureSwitchOn(confirmSwitch) // defeat a swallowed first click (prod hydration)
  // Persisted server-side.
  const ownedSlips = await adminSlipsForExpense(trip.token, ownerExp!.id)
  expect(ownedSlips[0]?.confirmed).toBe(true)

  // Owner sends a slip toward B's expense (manual mode → no OCR, ref null).
  await page.getByRole('button', { name: 'จ่าย / ส่งสลิป' }).click()
  const slipSheet = page.getByRole('dialog')
  await slipSheet.getByRole('button', { name: 'พิมพ์เอง' }).click()
  await expect(slipSheet.getByLabel('จำนวนเงิน (บาท)')).toHaveValue('200.00') // 600/3
  await slipSheet.getByLabel('วันเวลาที่โอน').fill('2026-06-19T12:30')
  await page.getByRole('button', { name: 'ส่งสลิป' }).click()
  await expect(page.getByText('ส่งสลิปแล้ว')).toBeVisible()

  // Close gates all anon writes (M9/J5: trip close → "ปิดทริป"). Wait for the
  // status to flip IN-PLACE (setSessionStatus revalidates) before the API checks,
  // so the close is guaranteed committed and a swallowed first click is retried.
  await clickUntilVisible(
    page.getByRole('button', { name: 'ปิดทริป', exact: true }),
    page.getByRole('button', { name: 'เปิดทริปอีกครั้ง', exact: true }),
  )
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('ปิดแล้ว', { exact: true })).toBeVisible()
  const closedApi = await apiCtx('198.51.100.32')
  expect((await joinTrip(closedApi, trip.token, 'สาย')).status, 'join closed').toBe(403)
  expect((await addExpense(closedApi, trip.token, bToken, { title: 'x', amountSatang: 100, split: 2 })).status, 'expense closed').toBe(403)
  expect(await sendTripSlip(closedApi, trip.token, { participantToken: bToken, expenseId: bExpenseId, amountSatang: 100, refCode: null }), 'slip closed').toBe(403)
  await closedApi.dispose()

  // Reopen, then delete → back to the sessions list.
  await clickUntilVisible(
    page.getByRole('button', { name: 'เปิดทริปอีกครั้ง', exact: true }),
    page.getByRole('button', { name: 'ปิดทริป', exact: true }),
  )
  await page.getByRole('button', { name: 'ลบ', exact: true }).click()
  await page.waitForURL('**/sessions')
  await expect(page.getByRole('button', { name: 'สร้างรายการ' })).toBeVisible()

  await ctx.close()
})
