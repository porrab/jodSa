import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, resetInvestData, seedAccount, seedInvestHolding } from './helpers/admin'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
test('DS-11 summary precedes utilities, snapshot keeps its accessible name, Add is 44px', async ({ page }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing canonical test user A')
  await resetAllUserData(user.id); await resetInvestData(user.id)
  await seedAccount(user.id, 'Overview test', 'SCB')
  await seedInvestHolding(user.id, { symbol: 'PTT', currentValueMinor: '20000', ledger: [{ type: 'buy', qty: '1', priceMinor: '10000', datetime: '2026-01-01T12:00:00Z' }] })
  await page.goto('/invest'); await page.waitForLoadState('networkidle')
  const add = await page.getByRole('button', { name: 'เพิ่มสินทรัพย์', exact: true }).boundingBox()
  expect(add!.height).toBeGreaterThanOrEqual(44)
  await page.getByRole('tab', { name: 'ภาพรวม', exact: true }).click()
  const snapshot = page.getByRole('button', { name: 'บันทึกสแนปช็อต', exact: true })
  await expect(snapshot).toHaveText('เก็บยอด')
  await expect(snapshot).toHaveAttribute('data-variant', 'ghost')
  const label = await page.getByText('มูลค่ารวม (THB)', { exact: true }).boundingBox()
  const utility = await page.getByRole('button', { name: 'อัปเดตราคา', exact: true }).boundingBox()
  expect(label!.y).toBeLessThan(utility!.y)
})
