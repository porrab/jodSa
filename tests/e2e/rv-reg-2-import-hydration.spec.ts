import path from 'node:path'
import { expect, test } from '@playwright/test'
import { env, GENERATED_DIR, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'

test.use({ storageState: STORAGE_A })

test('RV-REG-2 file selected before hydration reaches slip confirmation', async ({ page }) => {
  test.setTimeout(180_000)
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user A missing: ${env.userA.email}`)
  await resetAllUserData(user.id)
  await seedAccount(user.id, 'QA pre-hydration import', 'SCB')

  let releaseBundles!: () => void
  const bundlesReleased = new Promise<void>((resolve) => { releaseBundles = resolve })
  await page.route(/\/\_next\/static\/chunks\/.*\.js(?:\?.*)?$/, async (route) => {
    await bundlesReleased
    await route.continue()
  })

  await page.goto('/import', { waitUntil: 'domcontentloaded' })
  const input = page.locator('input[type="file"]').first()
  await expect(input).toBeAttached()
  await input.setInputFiles(path.join(GENERATED_DIR, 'slip-qr-a.png'))
  releaseBundles()

  await expect(page.getByRole('button', { name: 'ยืนยันและบันทึก' })).toBeVisible({ timeout: 120_000 })
})
