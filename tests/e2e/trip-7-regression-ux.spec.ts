import { test, expect } from '@playwright/test'
import { STORAGE_A } from './helpers/env'

/**
 * TRIP-7 (UX regression) — the session create dialog (where the new trip type
 * lives) shows required-field asterisks and carries no leftover "(optional)" /
 * "(ไม่บังคับ)" copy, for both the collect and trip types. The exhaustive
 * untranslated-string guarantee is a key-parity check (en/th = 407/407, no gaps,
 * verified out-of-band) plus M5-S1's core th⇄en toggle; the collect guest journey
 * itself is re-proven green by m4-guest-pay.
 */

test('TRIP-7 create dialog: required asterisks present, no optional text (collect + trip)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: STORAGE_A })
  const page = await ctx.newPage()
  await page.goto('/sessions')
  await page.getByRole('button', { name: 'สร้างรายการ' }).click()
  const dialog = page.getByRole('dialog')

  // Collect (default): required marks present, no optional copy.
  await expect(dialog.locator('span.text-destructive', { hasText: '*' }).first()).toBeVisible()
  await expect(dialog.getByText(/\(optional\)|\(ไม่บังคับ\)/i)).toHaveCount(0)

  // Trip: title still required, still no optional copy.
  await dialog.getByRole('button', { name: /หารกัน/ }).click()
  await expect(dialog.locator('span.text-destructive', { hasText: '*' }).first()).toBeVisible()
  await expect(dialog.getByText(/\(optional\)|\(ไม่บังคับ\)/i)).toHaveCount(0)

  await ctx.close()
})
