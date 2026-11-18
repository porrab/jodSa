import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, resetInvestData, seedAccount } from './helpers/admin'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing canonical test user A')
  await resetAllUserData(user.id)
  await resetInvestData(user.id)
  await seedAccount(user.id, 'Mobile audit A', 'SCB')
  await seedAccount(user.id, 'Mobile audit B', 'KBank')
})

test('FB-1 header Add opens on every investment tab', async ({ page }) => {
  await page.goto('/invest')
  await page.waitForLoadState('networkidle')
  for (const name of ['สินทรัพย์', 'ภาพรวม', 'แผนรายเดือน']) {
    await page.getByRole('tab', { name, exact: true }).click()
    await page.getByRole('button', { name: 'เพิ่มสินทรัพย์', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'เพิ่มสินทรัพย์', exact: true })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(sheet).toBeHidden()
  }
})
