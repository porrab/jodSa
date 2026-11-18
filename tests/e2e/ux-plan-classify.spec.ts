import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, resetInvestData, seedAccount } from './helpers/admin'
import { addCustomHolding, openPlanTab, submitPlan } from './helpers/invest'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })

test('FB-2 unclassified long asset stays inside the mobile viewport', async ({ page }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing canonical test user A')
  await resetAllUserData(user.id)
  await resetInvestData(user.id)
  await seedAccount(user.id, 'Classify test', 'SCB')
  await addCustomHolding(page, {
    name: 'กองทุนทดสอบชื่อยาวสำหรับการจัดประเภทสินทรัพย์บนโทรศัพท์',
    assetClassLabel: 'กองทุนรวมไทย', currency: 'THB', qty: '1', price: '100',
  })
  await openPlanTab(page)
  await submitPlan(page)
  await expect(page.getByText('มีสินทรัพย์ยังไม่จัดประเภท', { exact: true })).toBeVisible()
  const widths = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport)
  const box = await page.getByRole('button', { name: 'บันทึกการจัดประเภท', exact: true }).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x + box!.width).toBeLessThanOrEqual(widths.viewport)
})
