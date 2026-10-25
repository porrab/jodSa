import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
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

const EVIDENCE_DIR = path.resolve('tests/e2e/evidence/ds-6-2026-10-26/app')

async function ready(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => node.remove()))
}

async function openAdd(page: Page) {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  return page.getByRole('dialog', { name: 'บันทึกรายการ' })
}

test.beforeAll(async () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user A missing: ${env.userA.email}`)
  await resetAllUserData(user.id)
  await resetInvestData(user.id)

  const accountIds: string[] = []
  for (const [name, bank] of [
    ['เงินสด', 'KBank'],
    ['make', 'KBank'],
    ['krungthai', 'KTB'],
    ['Dime! Save', 'KKP'],
    ['SCB', 'SCB'],
    ['TrueMoney', 'TrueMoney'],
  ] as const) {
    accountIds.push(await seedAccount(user.id, name, bank))
  }
  await seedTransaction(user.id, accountIds[1], {
    type: 'income', amountSatang: 1_200_000, category: 'salary',
  })
  await seedTransaction(user.id, accountIds[2], {
    type: 'expense', amountSatang: 6_500, category: 'food', counterparty: 'ร้าน DS6',
  })
  await seedInvestHolding(user.id, {
    symbol: 'PTT',
    currentValueMinor: '2127900',
    ledger: [{ type: 'buy', qty: '10', priceMinor: '200000', datetime: '2026-01-01T00:00:00Z' }],
  })
})

test('N2 account form uses Thai display labels without changing bank values', async ({ page }) => {
  await page.goto('/accounts')
  await page.getByRole('button', { name: 'เพิ่มบัญชี', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'เพิ่มบัญชี' })
  await expect(sheet.getByRole('button', { name: 'เกียรตินาคินภัทร', exact: true })).toHaveAttribute('data-bank-code', 'KIATNAKIN')
  await expect(sheet.getByRole('button', { name: 'แอล เอช แบงก์', exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'อื่นๆ', exact: true })).toHaveAttribute('data-bank-code', 'Other')
  await expect(sheet.getByRole('button', { name: /KIATNAKIN|LH Bank|Other/ })).toHaveCount(0)
  await sheet.getByLabel('ชื่อบัญชี').fill('make')
  await sheet.getByRole('button', { name: 'กสิกรไทย', exact: true }).click()
  await sheet.getByLabel('ยอดเงินตั้งต้น').fill('12000.00')
  await sheet.getByLabel('เลขท้ายบัญชี').fill('1234')
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '17-account-form.png'), fullPage: true })
})

test('N3 manual categories follow transaction type and preserve DS-3 account behavior', async ({ page }) => {
  const sheet = await openAdd(page)
  const categories = sheet.getByTestId('transaction-category-field')
  await expect(categories.getByRole('button', { name: 'เงินเดือน', exact: true })).toHaveCount(0)
  await expect(categories.getByRole('button', { name: 'ฟรีแลนซ์', exact: true })).toHaveCount(0)
  await categories.getByRole('button', { name: 'อาหาร', exact: true }).click()
  await expect(sheet.getByTestId('account-selection-hint')).toContainText('เลือกตามหมวด')
  await sheet.getByRole('button', { name: 'รายรับ', exact: true }).click()
  await expect(categories.getByRole('button', { name: 'อาหาร', exact: true })).toHaveCount(0)
  await expect(categories.getByRole('button', { name: 'เงินเดือน', exact: true })).toBeVisible()
  await expect(categories.getByRole('button', { name: 'ฟรีแลนซ์', exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'รายจ่าย', exact: true }).click()
  await expect(categories.locator('[aria-pressed="true"]')).toHaveCount(0)
  await sheet.getByLabel('จำนวนเงิน').fill('1250.00')
  await categories.getByRole('button', { name: 'อาหาร', exact: true }).click()
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '06-add-manual-expense.png'), fullPage: true })
})

test('N4 transfer uses the anchored swap divider', async ({ page }) => {
  const sheet = await openAdd(page)
  await sheet.getByRole('button', { name: 'โอนเงิน', exact: true }).click()
  await sheet.getByLabel('จำนวนเงิน').fill('2000.00')
  await sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: /Dime! Save/ }).click()
  const divider = sheet.getByTestId('swap-divider')
  await expect(divider).toBeVisible()
  await expect(divider.locator('[data-slot="swap-divider-line"]')).toHaveCount(2)
  await expect(divider.getByRole('button', { name: 'สลับต้นทาง–ปลายทาง' })).toBeVisible()
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '07-add-transfer.png'), fullPage: true })
})

test('N3/N5 slip confirm filters categories and groups the amount', async ({ page }) => {
  test.setTimeout(600_000)
  await page.goto('/import')
  await page.locator('input[type="file"]').setInputFiles(path.join(GENERATED_DIR, 'slip-qr-a.png'))
  const categories = page.getByTestId('slip-category-field')
  await expect(categories).toBeVisible({ timeout: 480_000 })
  await expect(categories.getByRole('button', { name: 'เงินเดือน', exact: true })).toHaveCount(0)
  await expect(categories.getByRole('button', { name: 'ฟรีแลนซ์', exact: true })).toHaveCount(0)
  await expect(page.locator('#slip-amount')).toHaveValue('1,250.00')
  await categories.getByRole('button', { name: 'อาหาร', exact: true }).click()
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '10-add-slip-confirm.png'), fullPage: true })
})

test('N6 invest row keeps name/meta single-line and uses a short signed P/L', async ({ page }) => {
  await page.goto('/invest')
  const row = page.getByRole('button', { name: /PTT ปตท/ })
  await expect(row.getByText('+฿1,279.00', { exact: true })).toBeVisible()
  await expect(row.getByText(/กำไร\/ขาดทุน/)).toHaveCount(0)
  const name = row.getByText('ปตท. จำกัด (มหาชน)', { exact: true })
  const meta = row.getByText('หุ้นไทย (SET) · หลัก (Core) · 10 หน่วย', { exact: true })
  await expect(name).toHaveCSS('white-space', 'nowrap')
  await expect(meta).toHaveCSS('white-space', 'nowrap')
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '29-invest-holdings.png'), fullPage: true })
})
