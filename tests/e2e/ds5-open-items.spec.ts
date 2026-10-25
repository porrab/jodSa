import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { env, GENERATED_DIR, STORAGE_A } from './helpers/env'
import {
  findUserByEmail,
  resetAllUserData,
  resetInvestData,
  seedAccount,
  seedInvestHolding,
  seedTransaction,
} from './helpers/admin'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

const EVIDENCE_DIR = path.resolve('tests/e2e/evidence/ds-5-open-items-2026-10-25/app')

async function ready(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => node.remove()))
}

test.beforeAll(async () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user A missing: ${env.userA.email}`)
  await resetAllUserData(user.id)
  await resetInvestData(user.id)

  const accounts: string[] = []
  for (const [name, bank] of [
    ['เงินสด', 'KBank'],
    ['make', 'KBank'],
    ['krungthai', 'KTB'],
    ['Dime! Save', 'KKP'],
    ['SCB', 'SCB'],
    ['TrueMoney', 'TrueMoney'],
  ] as const) {
    accounts.push(await seedAccount(user.id, name, bank))
  }
  const amounts = [60_500, 1_200_000, 735_138, 494_900, 259_900, 8_900]
  for (let i = 0; i < accounts.length; i++) {
    await seedTransaction(user.id, accounts[i], {
      type: 'income',
      amountSatang: amounts[i],
      category: 'other',
    })
  }
  await seedInvestHolding(user.id, {
    symbol: 'PTT',
    currentValueMinor: '2127900',
    ledger: [{ type: 'buy', qty: '10', priceMinor: '200000', datetime: '2026-01-01T00:00:00Z' }],
  })
})

test('C4 selected segmented tab is flat', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'บันทึกรายการ' })
  const selected = sheet.locator('[data-slot="segmented-item"][data-state="active"]').first()
  await expect(selected).toBeVisible()
  await expect.poll(() => selected.evaluate((node) => {
    const shadow = getComputedStyle(node).boxShadow
    if (shadow === 'none') return false
    return [...shadow.matchAll(/rgba?\([^)]*\)/g)].some(([color]) => {
      if (!color.startsWith('rgba(')) return true
      const alpha = Number(color.slice(5, -1).split(',').at(-1)?.trim())
      return alpha > 0
    })
  })).toBe(false)
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '06-add-manual-expense.png'), fullPage: true })
})

test('S2 slip confirmation shows parsed badge and bank/reference metadata', async ({ page }) => {
  test.setTimeout(600_000)
  await page.goto('/import')
  await page.locator('input[type="file"]').setInputFiles(path.join(GENERATED_DIR, 'slip-qr-a.png'))
  await expect(page.getByText('อ่านจากสลิปแล้ว')).toBeVisible({ timeout: 480_000 })
  await expect(page.getByText(/SCB · เลขอ้างอิง .+…../)).toBeVisible()
  await expect(page.getByText('slip-qr-a.png')).toHaveCount(0)
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '10-add-slip-confirm.png'), fullPage: true })
})

test('S7 account summary separates its caption from the 28/700 amount', async ({ page }) => {
  await page.goto('/accounts')
  const caption = page.getByText('รวม 6 บัญชี', { exact: true })
  const amount = caption.locator('xpath=following-sibling::p[1]')
  await expect(caption).toHaveCSS('font-size', '14px')
  await expect(amount).toHaveCSS('font-size', '28px')
  await expect(amount).toHaveCSS('font-weight', '700')
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '15-accounts.png'), fullPage: true })
})

test('S9 investment row uses one metadata line and total is 28/700', async ({ page }) => {
  await page.goto('/invest')
  const totalLabel = page.getByText('มูลค่ารวม (THB) · กรอกเอง')
  const total = totalLabel.locator('xpath=following-sibling::p[1]')
  await expect(total).toHaveCSS('font-size', '28px')
  await expect(total).toHaveCSS('font-weight', '700')
  await expect(page.getByText('หุ้นไทย (SET) · หลัก (Core) · 10 หน่วย')).toBeVisible()
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '29-invest-holdings.png'), fullPage: true })
})
