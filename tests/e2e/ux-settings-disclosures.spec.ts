import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, seedAccount } from './helpers/admin'
import th from '../../messages/th.json'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
test('DS-12 settings collapse optional workflows and disclose Vision risks before key entry', async ({ page }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing user A')
  await seedAccount(user.id, 'Settings test', 'SCB')
  await page.goto('/settings'); await page.waitForLoadState('networkidle')
  for (const id of ['csv', 'vision', 'push']) await expect(page.getByTestId(`settings-${id}`)).not.toHaveAttribute('open')
  await expect(page.getByRole('button', { name: 'สว่าง', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: th.settings.exportDownload, exact: true })).not.toBeVisible()
  const vision = page.getByTestId('settings-vision')
  await vision.locator('summary').click()
  await expect(vision.getByText(th.vision.guidance, { exact: true })).toBeVisible()
  await expect(vision.getByText(th.vision.privacy, { exact: true })).toBeVisible()
  await expect(vision.getByLabel(th.vision.key)).toHaveCount(0)
  await vision.getByRole('switch', { name: th.vision.enable }).click()
  await expect(vision.getByRole('switch', { name: th.vision.enable })).not.toBeChecked()
  await vision.getByRole('checkbox', { name: th.vision.ack }).check()
  await vision.getByRole('button', { name: th.vision.accept }).click()
  const key = await vision.getByLabel(th.vision.key).boundingBox()
  const guidance = await vision.getByText(th.vision.guidance, { exact: true }).boundingBox()
  const privacy = await vision.getByText(th.vision.privacy, { exact: true }).boundingBox()
  expect(guidance!.y + guidance!.height).toBeLessThanOrEqual(key!.y)
  expect(privacy!.y + privacy!.height).toBeLessThanOrEqual(key!.y)
  await expect(page.getByText(th.settings.deleteAccountDesc, { exact: true })).toBeVisible()
  await page.getByTestId('settings-csv').locator('summary').click()
  await expect(page.getByRole('button', { name: th.settings.exportDownload, exact: true })).toBeVisible()
})
