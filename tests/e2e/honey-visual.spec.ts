import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { env, GENERATED_DIR, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, resetInvestData, seedAccount } from './helpers/admin'

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })

const themes = ['light', 'dark'] as const

async function applyTheme(page: Page, theme: 'light' | 'dark') {
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00+07:00'))
  await page.addInitScript((value: string) => localStorage.setItem('theme', value), theme)
}

async function ready(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  // The development-only Next.js badge is outside the product surface and is
  // not present in the Figma reference or production build.
  await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => node.remove()))
}

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`Missing visual-audit user ${env.userA.email}`)
  await resetAllUserData(user.id)
  await resetInvestData(user.id)
  await seedAccount(user.id, 'Dime! Save', 'Dime')
  await seedAccount(user.id, 'SCB หลัก', 'SCB')
})

for (const theme of themes) {
  for (const [name, route] of [
    ['home', '/dashboard'],
    ['transactions', '/transactions'],
    ['accounts', '/accounts'],
    ['budgets', '/budgets'],
    ['invest', '/invest'],
    ['recurring', '/recurring'],
    ['groups', '/groups'],
    ['import', '/import'],
    ['sessions', '/sessions'],
    ['more', '/more'],
    ['settings', '/settings'],
  ] as const) {
    test(`${theme} ${name}`, async ({ page }) => {
      await applyTheme(page, theme)
      await page.goto(route)
      await ready(page)
      await expect(page).toHaveScreenshot(`${theme}-${name}.png`, { fullPage: true })
    })
  }

  test(`${theme} add manual, transfer, and slip surfaces`, async ({ page }) => {
    await applyTheme(page, theme)
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'เพิ่มรายการ' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await ready(page)
    await expect(page).toHaveScreenshot(`${theme}-add-manual.png`, { fullPage: true })

    await page.getByRole('button', { name: 'โอนเงิน', exact: true }).click()
    await expect(page.getByRole('radiogroup', { name: 'บัญชีต้นทาง' })).toBeVisible()
    await expect(page).toHaveScreenshot(`${theme}-add-transfer.png`, { fullPage: true })

    await page.getByRole('dialog').locator('input[type="file"]').first().setInputFiles(path.join(GENERATED_DIR, 'slip-noqr.png'))
    await expect(page.getByRole('tab', { name: 'สลิป' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('รูปภาพไม่ถูกส่งออกนอกอุปกรณ์').first()).toBeVisible()
    await expect(page).toHaveScreenshot(`${theme}-add-slip.png`, { fullPage: true })
  })
}

test.describe('signed-out auth surfaces', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const theme of themes) {
    for (const [name, route] of [['login', '/login'], ['signup', '/signup']] as const) {
      test(`${theme} ${name}`, async ({ page }) => {
        await applyTheme(page, theme)
        await page.goto(route)
        await ready(page)
        await expect(page).toHaveScreenshot(`${theme}-${name}.png`, { fullPage: true })
      })
    }
  }
})
