import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A, GENERATED_DIR } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

/**
 * QA-M7B — Duplicate-conflict override (M7-B / design J2).
 *
 * The same slip imported twice must NOT silently hard-block: the confirm form
 * surfaces the colliding transaction (date · amount · counterparty) and a
 * "บันทึกเป็นรายการใหม่" override that saves a NEW row with ref_code cleared
 * (so it can't collide on UNIQUE(user_id, ref_code)). This supersedes the old
 * bare "รายการนี้มีอยู่แล้ว" block (M2-S3's former behavior).
 *
 * Uses the same synthetic QR fixture as the M2 journey (readable EMVCo ref via
 * jsqr), so the second import is a true ref_code duplicate. Runs the real
 * on-device pipeline; OCR download makes it slow — generous timeouts.
 */

const SLIP_A = path.join(GENERATED_DIR, 'slip-qr-a.png')
const ACCT = 'QA-M7B'

test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetUserData(user.id)
  await seedAccount(user.id, ACCT, 'SCB')
})

async function importSlip(page: Page, fixture: string): Promise<void> {
  await page.goto('/import')
  await page.waitForLoadState('networkidle')
  // The dropzone is a client component; on the PROD bundle its onChange handler
  // attaches a beat after the input exists in the DOM. Firing setInputFiles too
  // early loses the change event (React hasn't wired it yet) and the page sits at
  // idle. Wait for the dropzone to render, give hydration a moment, then fire —
  // and retry once if the first event was still lost to the race.
  await expect(page.getByText('วางภาพสลิปที่นี่')).toBeVisible()
  const input = page.locator('input[type="file"]')
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.waitForTimeout(1000)
    await input.setInputFiles(fixture)
    const leftIdle = await page
      .getByText('วางภาพสลิปที่นี่')
      .waitFor({ state: 'hidden', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (leftIdle) break
  }
  await expect(page.getByRole('heading', { name: 'ยืนยันรายการ' })).toBeVisible({ timeout: 240_000 })
}

const confirmButton = (page: Page) => page.getByRole('button', { name: 'ยืนยันและบันทึก' })

test('QA-M7B-1 duplicate ref_code → J2 override saves a new row (not a hard block)', async ({ page }) => {
  test.setTimeout(600_000)

  // First import saves cleanly (฿1,250.00, QR ref present).
  await importSlip(page, SLIP_A)
  await expect(page.locator('input[name="amount"]')).toHaveValue('1250.00')
  await expect(page.getByText('Ref (จาก QR)')).toBeVisible()
  await confirmButton(page).click()
  await page.waitForURL('**/transactions', { timeout: 30_000 })
  await expect(page.getByText(/1,250\.00/)).toHaveCount(1)

  // Second import of the SAME slip → confirm surfaces the J2 duplicate-conflict
  // panel (colliding tx shown), NOT the legacy hard-block string.
  await importSlip(page, SLIP_A)
  await confirmButton(page).click()
  await expect(page.getByText(/อาจซ้ำกับ/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'บันทึกเป็นรายการใหม่' })).toBeVisible()

  // Override → a second row saves (ref_code cleared so no UNIQUE collision).
  await page.getByRole('button', { name: 'บันทึกเป็นรายการใหม่' }).click()
  await page.waitForURL('**/transactions', { timeout: 30_000 })
  await expect(page.getByText(/1,250\.00/)).toHaveCount(2)
})
