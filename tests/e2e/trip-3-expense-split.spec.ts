import path from 'node:path'
import { test, expect } from '@playwright/test'
import { env, GENERATED_DIR } from './helpers/env'
import { findUserByEmail, adminClient } from './helpers/admin'
import { seedTripSession, deleteTripSession, clearOwnerSessions, type SeededTrip } from './helpers/trip'

/**
 * TRIP-3 — a participant adds an expense with their receiving QR; equal split is
 * shown to everyone else (per-head = total ÷ split_among, rounded), and the QR is
 * served as a signed URL in the pay sheet. The QR object must land in the
 * trip-qr bucket at {session_id}/{expense_id}.<ext>.
 */

const QR_IMAGE = path.join(GENERATED_DIR, 'slip-qr-a.png') // any PNG works as the receiving QR

test.describe.configure({ mode: 'serial' })

let trip: SeededTrip

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  await clearOwnerSessions(a.id)
  trip = await seedTripSession(a.id, 'QA-TRIP-3 ก๋วยเตี๋ยว')
})

test.afterAll(async () => { if (trip) await deleteTripSession(trip.token) })

test('TRIP-3 add expense + QR; others see equal split + the QR; object lands in trip-qr', async ({ browser }) => {
  // Two guests join (owner + เอ + บี = 3 members → default split 3).
  const aCtx = await browser.newContext()
  const guestA = await aCtx.newPage()
  await guestA.goto(`/pay/${trip.token}`)
  await guestA.getByLabel('ชื่อเล่น').fill('เอ')
  await guestA.getByRole('button', { name: 'เข้าร่วม' }).click()
  await expect(guestA.getByText('รายการในทริป')).toBeVisible()

  const bCtx = await browser.newContext()
  const guestB = await bCtx.newPage()
  await guestB.goto(`/pay/${trip.token}`)
  await guestB.getByLabel('ชื่อเล่น').fill('บี')
  await guestB.getByRole('button', { name: 'เข้าร่วม' }).click()
  await expect(guestB.getByText('รายการในทริป')).toBeVisible()

  // เอ fronts ฿900 split 3 → per-head ฿300, with a receiving QR.
  await guestA.reload()
  await guestA.waitForLoadState('networkidle') // hydrate before interacting (prod build)
  // M9 (design v3, J5): the add-expense trigger was renamed to "จดบิล".
  await guestA.getByRole('button', { name: 'จดบิล', exact: true }).click()
  const sheet = guestA.getByRole('dialog')
  await sheet.getByLabel('ชื่อรายการ').fill('ค่าอาหาร')
  await sheet.getByLabel('ยอดที่จ่ายไป (บาท)').fill('900')
  await sheet.getByLabel('หารกี่คน').fill('3')
  await sheet.locator('input[type="file"]').setInputFiles(QR_IMAGE)
  await guestA.getByRole('button', { name: 'บันทึกรายการ' }).click()
  await expect(guestA.getByText('เพิ่มรายการแล้ว')).toBeVisible()

  // บี (a non-payer) sees the expense with payer nickname, total, per-head, and "you owe".
  await guestB.reload()
  await expect(guestB.getByText('จ่ายโดย เอ')).toBeVisible()
  await expect(guestB.getByText('฿900.00')).toBeVisible()
  await expect(guestB.getByText('คนละ ฿300.00')).toBeVisible()
  await expect(guestB.getByText('คุณต้องจ่าย ฿300.00')).toBeVisible()

  // The pay sheet shows the uploaded QR (signed URL).
  await guestB.getByRole('button', { name: 'จ่าย / ส่งสลิป' }).click()
  await expect(guestB.getByText('สแกน QR นี้เพื่อโอน')).toBeVisible()
  await expect(guestB.getByRole('img', { name: 'ค่าอาหาร' })).toBeVisible()

  // The QR object is in trip-qr at {session_id}/{expense_id}.png.
  const { data: exp } = await adminClient()
    .from('session_expenses').select('id, qr_image_path').eq('session_id', trip.token).single()
  expect(exp?.qr_image_path).toBe(`${trip.token}/${exp?.id}.png`)
  const { data: objs } = await adminClient().storage.from('trip-qr').list(trip.token)
  expect((objs ?? []).map((o) => o.name)).toContain(`${exp?.id}.png`)

  await aCtx.close()
  await bCtx.close()
})
