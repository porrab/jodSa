import path from 'node:path'
import { test, expect } from '@playwright/test'
import { env, GENERATED_DIR, STORAGE_A } from './helpers/env'
import { findUserByEmail } from './helpers/admin'
import {
  seedTripSession, deleteTripSession, clearOwnerSessions, apiCtx,
  addExpense, type SeededTrip,
} from './helpers/trip'

/**
 * TRIP-4 (UI half) + TRIP-6e privacy — an ower sends a slip by reading it
 * on-device (อ่านสลิป → amount auto-fills) and by typing it (พิมพ์เอง). The
 * payer (owner, in-app) sees the slips received and a confirm toggle that flips
 * the ower's view to "settled". Privacy: across the whole ower flow NO request
 * carries image bytes — slip parsing is on-device, only JSON posts leave.
 */

const GUEST_SLIP = path.join(GENERATED_DIR, 'slip-qr-b.png') // amount 2340.50 + EMVCo ref

test.describe.configure({ mode: 'serial' })

let trip: SeededTrip
let expenseId = ''

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  await clearOwnerSessions(a.id)
  trip = await seedTripSession(a.id, 'QA-TRIP-4 ทริปใต้')
  // Owner A fronts the expense → A is the payer/confirmer.
  const api = await apiCtx('198.51.100.40')
  const e = await addExpense(api, trip.token, trip.ownerParticipantToken, { title: 'ค่าอาหารทะเล', amountSatang: 90000, split: 3 })
  expect(e.status).toBe(201); expenseId = e.expenseId!
  await api.dispose()
})

test.afterAll(async () => { if (trip) await deleteTripSession(trip.token) })

test('TRIP-4 ower sends slip (read + manual), payer confirms, no image on the wire', async ({ browser }) => {
  test.setTimeout(600_000)

  // ── Ower B: fresh anon context, with request capture for the privacy check
  const bCtx = await browser.newContext()
  const b = await bCtx.newPage()

  const imageUploads: string[] = []
  const slipPostContentTypes: string[] = []
  const slipStatuses: number[] = []
  b.on('request', (req) => {
    if (req.method() !== 'POST') return
    const ct = req.headers()['content-type'] ?? ''
    const body = req.postDataBuffer()
    if (ct.startsWith('multipart/form-data') || ct.startsWith('image/') || (body !== null && body.length > 50_000)) {
      imageUploads.push(`${req.url()} ct=${ct} bytes=${body?.length ?? 0}`)
    }
    if (req.url().includes('/slips') && !req.url().includes('/confirm')) slipPostContentTypes.push(ct)
  })
  b.on('response', (res) => {
    const u = res.url()
    if (res.request().method() === 'POST' && u.includes('/slips') && !u.includes('/confirm')) slipStatuses.push(res.status())
  })

  await b.goto(`/pay/${trip.token}`)
  await b.getByLabel('ชื่อเล่น').fill('บี')
  await b.getByRole('button', { name: 'เข้าร่วม' }).click()
  await expect(b.getByText('คุณต้องจ่าย ฿300.00')).toBeVisible()

  // ── Slip 1: read on-device → amount auto-fills from the slip (2340.50)
  await b.getByRole('button', { name: 'จ่าย / ส่งสลิป' }).click()
  const sheet = b.getByRole('dialog')
  await sheet.locator('input[type="file"]').setInputFiles(GUEST_SLIP)
  await expect(sheet.getByLabel('จำนวนเงิน (บาท)')).toHaveValue('2340.50', { timeout: 240_000 })
  await sheet.getByLabel('วันเวลาที่โอน').fill('2026-06-19T10:00')
  await b.getByRole('button', { name: 'ส่งสลิป' }).click()
  await expect(sheet, 'sheet closes only on a successful send').toBeHidden({ timeout: 30_000 })

  // ── Slip 2: manual (พิมพ์เอง) — amount prefills the share, no ref
  await b.getByRole('button', { name: 'จ่าย / ส่งสลิป' }).click()
  const sheet2 = b.getByRole('dialog')
  await sheet2.getByRole('button', { name: 'พิมพ์เอง' }).click()
  await expect(sheet2.getByLabel('จำนวนเงิน (บาท)')).toHaveValue('300.00')
  await sheet2.getByLabel('วันเวลาที่โอน').fill('2026-06-19T11:00')
  await b.getByRole('button', { name: 'ส่งสลิป' }).click()
  await expect(sheet2, 'sheet closes only on a successful send').toBeHidden({ timeout: 30_000 })

  // ── Both slip posts succeeded (201), as JSON, with no image bytes on the wire
  expect(slipStatuses, 'both slip POSTs returned 201').toEqual([201, 201])
  expect(imageUploads, 'no slip-image bytes on the wire (parsing is on-device)').toEqual([])
  expect(slipPostContentTypes.every((ct) => ct.includes('application/json')), 'slip posts are JSON, not multipart/image').toBe(true)

  // ── Payer (owner, in-app) sees both slips and confirms one
  const aCtx = await browser.newContext({ storageState: STORAGE_A })
  const a = await aCtx.newPage()
  await a.goto(`/sessions/${trip.token}`)
  await expect(a.getByText('สลิปที่ได้รับ (2)')).toBeVisible()
  await a.getByRole('switch', { name: 'ยืนยันสลิป' }).first().click()
  await expect(a.getByRole('switch', { name: 'ยืนยันสลิป' }).first()).toBeChecked()

  // ── Confirming flips the ower's view to "settled"
  await b.reload()
  await expect(b.getByText('คุณจ่ายรายการนี้แล้ว')).toBeVisible()

  await aCtx.close()
  await bCtx.close()
})
