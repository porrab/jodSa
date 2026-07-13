import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail } from './helpers/admin'
import { clearOwnerSessions } from './helpers/trip'

/**
 * TRIP-1 — owner creates a trip session and the share card shows the FULL
 * absolute URL. Guards two things: (1) the trip type hides the collect-only
 * account/QR/target fields (only a title is required), and (2) the reported
 * "no URL, only path" bug — ShareLink must render https://host/pay/<token>,
 * not a bare /pay/<token>.
 */

test.describe.configure({ mode: 'serial' })

const TITLE = 'QA-TRIP-1 ทริปเขาใหญ่'

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  await clearOwnerSessions(a.id) // start from zero sessions
})

test('TRIP-1 trip create hides account/QR/target; share card shows the absolute URL', async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: STORAGE_A,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await ctx.newPage()

  await page.goto('/sessions')
  await page.getByRole('button', { name: 'สร้างรายการ' }).click()
  const dialog = page.getByRole('dialog')

  // Pick the trip type tile (collect is the default).
  await dialog.getByRole('button', { name: /หารกัน/ }).click()

  // Collect-only fields must be gone: no receiving-account select, no target.
  await expect(dialog.getByText('บัญชีรับเงิน (ต้องมี QR)')).toBeHidden()
  await expect(dialog.getByText('เป้าหมายยอดรวม (บาท)')).toBeHidden()
  await expect(dialog.getByRole('combobox')).toHaveCount(0)

  // Only the title is required.
  await dialog.getByLabel('ชื่อรายการ').fill(TITLE)
  await dialog.getByRole('button', { name: 'สร้างลิงก์จ่ายกลุ่ม' }).click()
  await expect(dialog).toBeHidden()

  // List card carries the trip badge. Scope to the card: M9's nav renamed the
  // sessions nav link + page heading to "ทริป" too, so an unscoped exact-text
  // match is now ambiguous (nav link + h1 + badge).
  const card = page.locator('a', { hasText: TITLE })
  await expect(card).toBeVisible()
  await expect(card.getByText('ทริป', { exact: true })).toBeVisible()

  // Open the in-app trip management view.
  await card.click()
  await page.waitForURL('**/sessions/*')
  const token = page.url().split('/sessions/')[1]
  expect(token.length).toBeGreaterThanOrEqual(21)

  // Share card: the <code> shows the FULL absolute URL, not a bare path.
  const code = page.locator('code').first()
  await expect(code).toBeVisible()
  const shown = (await code.textContent())?.trim() ?? ''
  expect(shown, 'share URL must be absolute').toMatch(/^https?:\/\/[^/]+\/pay\/.+/)
  expect(shown, 'share URL must not be a bare path').not.toMatch(/^\/pay\//)
  expect(shown).toContain(`/pay/${token}`)

  // Copy writes that absolute URL to the clipboard.
  await page.getByRole('button', { name: 'คัดลอก' }).click()
  await expect(page.getByText('คัดลอกลิงก์แล้ว')).toBeVisible()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toBe(shown)

  await ctx.close()
})
