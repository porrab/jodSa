import { expect, test } from '@playwright/test'
import { STORAGE_A } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
test('DS-10 full disclaimer and acknowledgement precede generation; money precedes six targets', async ({ page }) => {
  await page.goto('/invest'); await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: 'แผนรายเดือน', exact: true }).click()
  const details = page.getByTestId('plan-disclaimer')
  await expect(details).not.toHaveAttribute('open')
  const generate = page.getByRole('button', { name: 'สร้างแผน', exact: true })
  await expect(generate).toBeDisabled()
  await details.locator('summary').click()
  await expect(details.getByText(/คุณตรวจและส่งคำสั่งซื้อขายเองทั้งหมด/)).toBeVisible()
  await expect(generate).toBeDisabled()
  await details.getByRole('checkbox').check()
  await expect(generate).toBeEnabled()
  await expect(page.locator('[id^="target-"]')).toHaveCount(6)
  const money = await page.locator('#newMoney').boundingBox()
  const target = await page.locator('#target-us_equity').boundingBox()
  expect(money!.y).toBeLessThan(target!.y)
})
