import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { env, GENERATED_DIR, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount, seedTransaction } from './helpers/admin'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

const EVIDENCE_DIR = path.resolve('tests/e2e/evidence/ds-3')
let userId: string

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user A missing: ${env.userA.email}`)
  userId = user.id
})

async function seedScenario() {
  await resetAllUserData(userId)
  const accountA = await seedAccount(userId, 'บัญชี A', 'SCB')
  const accountB = await seedAccount(userId, 'บัญชี B', 'KBank')

  // Both category histories point to B, while the newest transaction makes A
  // the global default. Choosing food must therefore visibly move A → B.
  const payeeId = await seedTransaction(userId, accountB, {
    amountSatang: 24_000,
    category: 'transport',
    counterparty: 'ร้าน DS3',
    datetime: '2026-10-23T18:59:00+07:00',
  })
  const categoryId = await seedTransaction(userId, accountB, {
    amountSatang: 12_000,
    category: 'food',
    counterparty: null,
    datetime: '2026-10-23T19:02:00+07:00',
  })
  await seedTransaction(userId, accountA, {
    amountSatang: 1_000,
    category: 'other',
    counterparty: 'รายการล่าสุด',
    datetime: '2026-10-23T19:05:00+07:00',
  })
  return { accountA, accountB, payeeId, categoryId }
}

async function openManualSheet(page: Page) {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  return page.getByRole('dialog', { name: 'บันทึกรายการ' })
}

test('DS-3 category precedes account; category default moves the grid, manual touch keeps precedence', async ({ page }) => {
  await seedScenario()
  const sheet = await openManualSheet(page)
  const categoryField = sheet.getByTestId('transaction-category-field')
  const accountField = sheet.getByTestId('transaction-account-field')
  const categoryBox = await categoryField.boundingBox()
  const accountBox = await accountField.boundingBox()
  expect(categoryBox && accountBox && categoryBox.y < accountBox.y).toBe(true)

  await categoryField.getByRole('combobox').click()
  await page.getByRole('option', { name: 'อาหาร', exact: true }).click()
  const grid = accountField.getByRole('radiogroup', { name: 'บัญชี' })
  await expect(grid.getByRole('radio', { name: /บัญชี B/ })).toHaveAttribute('aria-checked', 'true')
  await expect(accountField.getByTestId('account-selection-hint')).toHaveText('เลือกตามหมวด อาหาร')

  await grid.getByRole('radio', { name: /บัญชี A/ }).click()
  await expect(accountField.getByTestId('account-selection-hint')).toHaveText('เลือกแล้ว: บัญชี A')

  await categoryField.getByRole('combobox').click()
  await page.getByRole('option', { name: 'เดินทาง', exact: true }).click()
  await expect(grid.getByRole('radio', { name: /บัญชี A/ })).toHaveAttribute('aria-checked', 'true')
  await expect(accountField.getByTestId('account-selection-hint')).toHaveText('เลือกแล้ว: บัญชี A')
})

test('DS-3 title/meta rule is identical on Home, transactions, and detail', async ({ page }) => {
  const { payeeId, categoryId } = await seedScenario()
  await page.goto('/dashboard')

  await expect(page.getByTestId(`home-transaction-${categoryId}-copy-title`)).toHaveText('อาหาร')
  await expect(page.getByTestId(`home-transaction-${categoryId}-copy-meta`)).toContainText('19:02 · บัญชี B')
  await expect(page.getByTestId(`home-transaction-${payeeId}-copy-title`)).toHaveText('ร้าน DS3')
  await expect(page.getByTestId(`home-transaction-${payeeId}-copy-meta`)).toContainText('18:59 · บัญชี B')

  await page.goto('/transactions')
  await expect(page.getByTestId(`transaction-${categoryId}-copy-title`)).toHaveText('อาหาร')
  await expect(page.getByTestId(`transaction-${categoryId}-copy-meta`)).toContainText('19:02 · บัญชี B')
  await expect(page.getByTestId(`transaction-${payeeId}-copy-title`)).toHaveText('ร้าน DS3')
  await expect(page.getByTestId(`transaction-${payeeId}-copy-meta`)).toContainText('18:59 · บัญชี B')

  await page.getByTestId(`transaction-${categoryId}`).click()
  const detail = page.getByRole('dialog', { name: 'รายการ' })
  await expect(detail.getByTestId('transaction-detail-copy-title')).toHaveText('อาหาร')
  await expect(detail.getByTestId('transaction-detail-copy-meta')).toContainText('19:02 · บัญชี B')
  await detail.getByRole('button', { name: 'Close' }).click()

  await page.getByTestId(`transaction-${payeeId}`).click()
  await expect(detail.getByTestId('transaction-detail-copy-title')).toHaveText('ร้าน DS3')
  await expect(detail.getByTestId('transaction-detail-copy-meta')).toContainText('18:59 · บัญชี B')
})

test('DS-3 evidence: manual and slip-confirm both render category above account', async ({ page }) => {
  test.setTimeout(600_000)
  await seedScenario()

  const manual = await openManualSheet(page)
  await manual.getByLabel('จำนวนเงิน (บาท)').fill('1250.00')
  await manual.getByTestId('transaction-category-field').getByRole('combobox').click()
  await page.getByRole('option', { name: 'อาหาร', exact: true }).click()
  await expect(manual.getByTestId('account-selection-hint')).toHaveText('เลือกตามหมวด อาหาร')
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'app-manual-add.png') })
  await manual.getByRole('button', { name: 'Close' }).click()

  await page.goto('/import')
  await page.waitForLoadState('networkidle')
  const input = page.locator('input[type="file"]')
  await input.setInputFiles(path.join(GENERATED_DIR, 'slip-qr-a.png'))
  await expect(page.getByRole('heading', { name: 'ยืนยันรายการ' })).toBeVisible({ timeout: 480_000 })
  const slipCategory = page.getByTestId('slip-category-field')
  const slipAccount = page.getByTestId('slip-account-field')
  const slipCategoryBox = await slipCategory.boundingBox()
  const slipAccountBox = await slipAccount.boundingBox()
  expect(slipCategoryBox && slipAccountBox && slipCategoryBox.y < slipAccountBox.y).toBe(true)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'app-slip-confirm.png'), fullPage: true })
})
