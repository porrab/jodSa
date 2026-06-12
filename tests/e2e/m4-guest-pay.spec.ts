import path from 'node:path'
import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { env, STORAGE_A, GENERATED_DIR } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

/**
 * M4 — guest group-payment journey (capability token, Pattern B).
 * Host uploads a bank QR, opens a session, shares /pay/<token>; a logged-out
 * guest parses a slip ON-DEVICE and submits only {amount, ref_code, paid_at}.
 * Slips are RECORDED, not verified — the host confirms each one manually.
 */

const QR_IMAGE = path.join(GENERATED_DIR, 'slip-qr-a.png') // any PNG works as the "bank QR"
const GUEST_SLIP = path.join(GENERATED_DIR, 'slip-qr-b.png') // amount 2340.50 + EMVCo ref QR

test.describe.configure({ mode: 'serial' })

let payToken = ''

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetUserData(user.id) // accounts cascade → sessions → slips
  await seedAccount(user.id, 'QA-M4', 'SCB')
})

async function uploadAccountQr(page: Page): Promise<void> {
  await page.goto('/accounts')
  await page.getByRole('button', { name: 'QR รับเงิน' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[name="file"]').setInputFiles(QR_IMAGE)
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(page.getByText('บันทึก QR แล้ว')).toBeVisible()
}

test('M4-S1 host creates session; logged-out guest sees QR and submits a slip; host confirms', async ({ browser }) => {
  test.setTimeout(600_000)

  // ── Host: upload account QR + create session
  const hostCtx = await browser.newContext({ storageState: STORAGE_A })
  const host = await hostCtx.newPage()
  await uploadAccountQr(host)

  await host.goto('/sessions')
  await host.getByRole('button', { name: 'สร้างรายการ' }).click()
  const dialog = host.getByRole('dialog')
  await dialog.getByLabel('ชื่อรายการ').fill('QA-M4 มื้อเย็น')
  await dialog.getByRole('combobox').click()
  await host.getByRole('option', { name: /QA-M4/ }).click()
  await dialog.getByRole('button', { name: 'สร้างลิงก์จ่ายกลุ่ม' }).click()
  await expect(dialog).toBeHidden()

  await host.getByText('QA-M4 มื้อเย็น').click()
  await host.waitForURL('**/sessions/*')
  payToken = host.url().split('/sessions/')[1]
  expect(payToken.length).toBeGreaterThanOrEqual(21)

  // ── Guest: fresh context, NO login
  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(`/pay/${payToken}`)
  await expect(guest.getByRole('heading', { name: 'QA-M4 มื้อเย็น' })).toBeVisible()
  await expect(guest.getByAltText('QR รับเงินของเจ้าของรายการ')).toBeVisible()

  // on-device parse → prefilled confirm → submit (OCR model download can be slow)
  await guest.locator('input[type="file"]').setInputFiles(GUEST_SLIP)
  await expect(guest.getByText('ตรวจสอบข้อมูลก่อนส่ง')).toBeVisible({ timeout: 240_000 })
  await expect(guest.locator('#guest-amount')).toHaveValue('2340.50')
  await guest.getByRole('button', { name: 'ส่งสลิป' }).click()
  await expect(guest.getByText('สลิปที่คุณส่งแล้ว')).toBeVisible({ timeout: 30_000 })
  await expect(guest.getByText('฿2,340.50').first()).toBeVisible()

  // ── Browser-restart persistence: token in URL + localStorage survives
  const guestState = await guestCtx.storageState()
  await guestCtx.close()
  const guestCtx2 = await browser.newContext({ storageState: guestState })
  const guest2 = await guestCtx2.newPage()
  await guest2.goto(`/pay/${payToken}`)
  await expect(guest2.getByText('สลิปที่คุณส่งแล้ว')).toBeVisible()
  await expect(guest2.getByText('฿2,340.50').first()).toBeVisible()
  await guestCtx2.close()

  // ── Host: entry recorded UNCONFIRMED; confirm toggle persists across reload
  await host.reload()
  await expect(host.getByText('฿2,340.50').first()).toBeVisible()
  const toggle = host.getByRole('switch', { name: 'ยืนยันสลิป' })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await host.reload()
  await expect(host.getByRole('switch', { name: 'ยืนยันสลิป' })).toBeChecked()

  await hostCtx.close()
})

test('M4-S2 guest POST past the rate limit is throttled (429)', async () => {
  expect(payToken, 'M4-S1 must run first').not.toBe('')
  const api = await pwRequest.newContext({
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.50' }, // own rate bucket
  })

  const statuses: number[] = []
  for (let i = 0; i < 12; i++) {
    const res = await api.post(`/api/sessions/${payToken}/slips`, {
      data: { amount_satang: 100 + i, ref_code: null, paid_at: new Date().toISOString() },
    })
    statuses.push(res.status())
  }
  expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(10)
  expect(statuses).toContain(429)
  await api.dispose()
})

test('M4-S4 a different anon client cannot read the session slips (RLS read-deny)', async () => {
  expect(payToken, 'M4-S1 must run first — needs an open session with a recorded slip').not.toBe('')

  // A "different anon client": the bare anon key, no user session. This is what a
  // hostile guest would have. session_slips has NO anon SELECT policy, so RLS must
  // return zero rows even though the host (authenticated owner) sees the slip.
  const anon = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await anon.from('session_slips').select('*').eq('session_id', payToken)

  // Under RLS with no matching policy, PostgREST returns an empty set (not an error).
  expect(error).toBeNull()
  expect(data ?? [], 'anon must not read any session_slips — non-empty is a data leak').toHaveLength(0)
})

test('M4-S3 closed session: guest POST rejected and page shows unavailable', async ({ browser }) => {
  expect(payToken, 'M4-S1 must run first').not.toBe('')

  // Host closes the session
  const hostCtx = await browser.newContext({ storageState: STORAGE_A })
  const host = await hostCtx.newPage()
  await host.goto(`/sessions/${payToken}`)
  await host.getByRole('button', { name: 'ปิดรับ' }).click()
  await expect(host.getByText('ปิดรับสลิปแล้ว')).toBeVisible()
  await hostCtx.close()

  // Fresh rate bucket so we measure RLS, not the limiter
  const api = await pwRequest.newContext({
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.51' },
  })
  const res = await api.post(`/api/sessions/${payToken}/slips`, {
    data: { amount_satang: 555, ref_code: null, paid_at: new Date().toISOString() },
  })
  expect(res.status()).toBe(403)
  await api.dispose()

  // Guest page no longer renders the session (RLS hides closed sessions)
  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(`/pay/${payToken}`)
  await expect(guest.getByText('ไม่พบรายการนี้')).toBeVisible()
  await guestCtx.close()
})
