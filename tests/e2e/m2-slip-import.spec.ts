import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A, GENERATED_DIR } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

/**
 * M2 — slip import journey against the real on-device pipeline
 * (jsqr QR decode → tesseract.js OCR → extract → mandatory confirm → save).
 *
 * Fixtures are synthetic slips generated in global.setup.ts. They prove the
 * journey and the dedup/privacy guarantees; real-photo OCR accuracy (≥9/10)
 * is the manual criterion M2-S5 — blocked on the private slip corpus.
 *
 * OCR + model download make these slow; timeouts are deliberately generous.
 */

const SLIP_A = path.join(GENERATED_DIR, 'slip-qr-a.png')
const SLIP_B = path.join(GENERATED_DIR, 'slip-qr-b.png')
const SLIP_NOQR = path.join(GENERATED_DIR, 'slip-noqr.png')

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetUserData(user.id)
  await seedAccount(user.id, 'QA-M2', 'SCB')
})

async function importSlip(page: Page, fixture: string): Promise<void> {
  await page.goto('/import')
  await page.locator('input[type="file"]').setInputFiles(fixture)
  // parse pipeline: preprocess → QR → OCR (model download on cold cache) → extract
  await expect(page.getByRole('heading', { name: 'ยืนยันรายการ' })).toBeVisible({ timeout: 240_000 })
}

const confirmButton = (page: Page) => page.getByRole('button', { name: 'ยืนยันและบันทึก' })

test('M2-S1 parsed slip pre-fills confirm form; nothing saves until confirmed', async ({ page }) => {
  test.setTimeout(360_000)
  await importSlip(page, SLIP_A)

  await expect(page.locator('input[name="amount"]')).toHaveValue('1250.00')
  await expect(page.getByText('Ref (จาก QR)')).toBeVisible() // QR decoded → ref_code present

  // mandatory confirmation: the parse alone must not have created a row
  const check = await page.context().newPage()
  await check.goto('/transactions')
  await expect(check.getByText('ยังไม่มีรายการ')).toBeVisible()
  await check.close()

  await confirmButton(page).click()
  await page.waitForURL('**/transactions', { timeout: 30_000 })
  await expect(page.getByText('฿1,250.00').first()).toBeVisible()
})

test('M2-S2 no request carries image bytes during the whole import flow', async ({ page }) => {
  test.setTimeout(360_000)

  const offenders: string[] = []
  let sawPostWithBody = false
  page.on('request', (req) => {
    const buf = req.postDataBuffer()
    if (!buf || buf.length === 0) return
    sawPostWithBody = true
    const hasImageMagic =
      buf.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || // PNG
      buf.includes(Buffer.from([0xff, 0xd8, 0xff])) || // JPEG
      (buf.includes(Buffer.from('RIFF')) && buf.includes(Buffer.from('WEBP')))
    // the fixture PNG is ~20–60 KB; any body large enough to smuggle it counts
    if (hasImageMagic || buf.length > 100_000) {
      offenders.push(`${req.method()} ${req.url()} (${buf.length} bytes${hasImageMagic ? ', image magic bytes' : ''})`)
    }
  })

  await importSlip(page, SLIP_B)
  await expect(page.locator('input[name="amount"]')).toHaveValue('2340.50')
  await confirmButton(page).click()
  await page.waitForURL('**/transactions', { timeout: 30_000 })

  expect(sawPostWithBody, 'capture sanity check: the save POST must have been observed').toBe(true)
  expect(offenders, 'requests that look like an image upload').toEqual([])
})

test('M2-S3 re-importing the same readable-QR slip is rejected', async ({ page }) => {
  test.setTimeout(360_000)
  await importSlip(page, SLIP_A) // same ref_code as the row saved in M2-S1
  await confirmButton(page).click()

  await expect(page.getByText('รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)')).toBeVisible({ timeout: 30_000 })

  await page.goto('/transactions')
  await expect(page.getByText('฿1,250.00')).toHaveCount(1) // still exactly one row
})

test('M2-S4 null-ref near-duplicate triggers soft warning (cancel and proceed)', async ({ page }) => {
  test.setTimeout(600_000)

  // first import of the QR-less slip saves cleanly
  await importSlip(page, SLIP_NOQR)
  await expect(page.getByText('Ref (จาก QR)')).toHaveCount(0) // no QR → no ref field
  await confirmButton(page).click()
  await page.waitForURL('**/transactions', { timeout: 30_000 })
  await expect(page.getByText('฿777.25').first()).toBeVisible()

  // second import: amber soft-dedup warning, cancel keeps one row
  await importSlip(page, SLIP_NOQR)
  await confirmButton(page).click()
  await expect(page.getByText('พบรายการที่คล้ายกัน')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'ยกเลิก' }).click()
  await page.goto('/transactions')
  await expect(page.getByText('฿777.25')).toHaveCount(1)

  // third import: proceeding past the warning is allowed (soft, not hard block)
  await importSlip(page, SLIP_NOQR)
  await confirmButton(page).click()
  await expect(page.getByText('พบรายการที่คล้ายกัน')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'บันทึกต่อ' }).click()
  await page.waitForURL('**/transactions', { timeout: 30_000 })
  await expect(page.getByText('฿777.25')).toHaveCount(2)
})
