import { expect, test } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, seedAccount } from './helpers/admin'
import th from '../../messages/th.json'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
test('RV-UX-1 closed disclaimer keeps acknowledgement visible above Generate', async ({ page }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing test user A')
  await seedAccount(user.id, 'Plan acknowledgement fixture', 'SCB')
  await page.goto('/invest'); await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: 'แผนรายเดือน', exact: true }).click()
  const details = page.getByTestId('plan-disclaimer')
  await expect(details).not.toHaveAttribute('open')
  const generate = page.getByRole('button', { name: 'สร้างแผน', exact: true })
  await expect(generate).toBeDisabled()
  const ack = page.getByRole('checkbox', { name: th.invest.plan.disclaimerAck })
  await expect(ack).toBeVisible()
  await expect(details.getByRole('checkbox')).toHaveCount(0)
  await ack.check()
  await expect(generate).toBeEnabled()
  await expect(details).not.toHaveAttribute('open')
  await ack.uncheck()
  await expect(generate).toBeDisabled()
  await details.locator('summary').click()
  await expect(details.getByText(/คุณตรวจและส่งคำสั่งซื้อขายเองทั้งหมด/)).toBeVisible()
  await expect(generate).toBeDisabled()
  await ack.check()
  await expect(generate).toBeEnabled()
  await expect(page.locator('[id^="target-"]')).toHaveCount(6)
  const money = await page.locator('#newMoney').boundingBox()
  const target = await page.locator('#target-us_equity').boundingBox()
  expect(money!.y).toBeLessThan(target!.y)
})
