import { test, expect } from '@playwright/test'
import { STORAGE_A } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
test('DS-14 dark active SVG uses on-honey ink while its label keeps foreground ink', async ({ page }) => {
  await page.goto('/settings'); await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'มืด', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.goto('/dashboard'); await page.waitForLoadState('networkidle')
  const nav = page.locator('nav').first()
  const home = nav.getByRole('link', { name: 'หน้าหลัก', exact: true })
  const icon = await home.locator('svg').evaluate(e => getComputedStyle(e).color)
  const label = await home.locator('span').evaluate(e => getComputedStyle(e).color)
  const onHoney = await nav.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).locator('span').evaluate(e => getComputedStyle(e).color)
  expect(icon).toBe(onHoney)
  expect(label).not.toBe(icon)
})
