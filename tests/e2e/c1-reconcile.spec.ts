import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { adminClient, findUserByEmail, resetAllUserData, seedAccount, seedTransaction } from './helpers/admin'
import { env, STORAGE_A } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

const EVIDENCE_DIR = path.resolve('tests/e2e/evidence/ds-7-2026-10-27/app')
let userId = ''
let accountId = ''

async function settled(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

async function captureWholeSheet(sheet: Locator, outputPath: string) {
  await sheet.evaluate((element) => {
    const node = element as HTMLElement
    node.scrollTop = 0
    node.style.maxHeight = 'none'
    node.style.height = 'auto'
    node.style.overflow = 'visible'
    node.style.position = 'absolute'
    node.style.top = '0'
    node.style.bottom = 'auto'
  })
  await sheet.screenshot({ path: outputPath })
}

test.beforeAll(async () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`Test user A is missing: ${env.userA.email}`)
  userId = user.id
  await resetAllUserData(userId)
  accountId = await seedAccount(userId, 'make', 'กสิกรไทย', '4415')
  await seedAccount(userId, 'Dime! Save', 'เกียรตินาคินภัทร', '9921')
  const recent = new Date(Date.now() - 3 * 86_400_000).toISOString()
  for (let index = 0; index < 3; index += 1) {
    await seedTransaction(userId, accountId, { amountSatang: 6_000, category: 'food', counterparty: 'ข้าว', datetime: recent })
    await seedTransaction(userId, accountId, { amountSatang: 4_700, category: 'transport', counterparty: 'BTS', datetime: recent })
    await seedTransaction(userId, accountId, { amountSatang: 5_500, category: 'food', counterparty: 'กาแฟ', datetime: recent })
  }
  const { error } = await adminClient().from('accounts').update({
    opening_balance_satang: 1_345_000,
    reconciled_at: '2026-10-03T12:00:00.000Z',
  }).eq('id', accountId).eq('user_id', userId)
  if (error) throw new Error(`seed opening balance failed: ${error.message}`)
})

test('C1 backfills a missing row, updates the Gap Bar from server truth, and reconciles the remainder', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto('/accounts')
  await page.getByRole('button', { name: /make.*฿12,964\.00/ }).click()
  await expect(page.getByRole('button', { name: /ปรับยอดให้ตรงธนาคาร/ })).toBeVisible()
  await settled(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '16-account-detail.png') })

  await page.getByRole('button', { name: /ปรับยอดให้ตรงธนาคาร/ }).click()
  const step1 = page.getByRole('dialog', { name: 'ปรับยอดให้ตรงธนาคาร · make' })
  await step1.getByLabel('ยอดในแอปธนาคารตอนนี้').fill('12552.00')
  await expect(step1.getByText('ในแอปมากกว่าธนาคาร ฿412.00')).toBeVisible()
  await settled(page)
  await captureWholeSheet(step1, path.join(EVIDENCE_DIR, '18-reconcile-gap.png'))

  await step1.getByRole('button', { name: 'ลงรายการที่ขาด' }).click()
  const step2 = page.getByRole('dialog', { name: 'ลงรายการที่ขาด · make' })
  await expect(step2.getByRole('progressbar', { name: /ยังขาดอีก ฿412\.00/ })).toBeVisible()
  await expect(step2.getByText('ล็อกไว้')).toBeVisible()
  await expect(step2.getByText(/ลงทุน|ถอนจากพอร์ต/)).toHaveCount(0)

  await step2.getByLabel('จำนวนเงิน').fill('60.00')
  await step2.getByTestId('transaction-category-field').getByRole('button', { name: 'อาหาร', exact: true }).click()
  await step2.getByLabel('ผู้รับ / ผู้จ่าย (ไม่บังคับ)').fill('ข้าว')
  await step2.getByRole('button', { name: 'บันทึก แล้วลงรายการต่อ' }).click()

  await expect(step2.getByRole('progressbar', { name: /ยังขาดอีก ฿352\.00/ })).toBeVisible({ timeout: 20_000 })
  await step2.getByLabel('จำนวนเงิน').fill('47.00')
  await step2.getByTestId('transaction-category-field').getByRole('button', { name: 'เดินทาง', exact: true }).click()
  await step2.getByLabel('ผู้รับ / ผู้จ่าย (ไม่บังคับ)').fill('BTS')
  await step2.getByRole('button', { name: 'บันทึก แล้วลงรายการต่อ' }).click()

  await expect(step2.getByRole('progressbar', { name: /ยังขาดอีก ฿305\.00/ })).toBeVisible({ timeout: 20_000 })
  await expect(step2.getByText(/ลงแล้ว \(2\).*฿107\.00/)).toBeVisible()
  await expect(page.getByText('บันทึกรายการแล้ว')).toHaveCount(0, { timeout: 10_000 })
  await step2.getByRole('button', { name: /กาแฟ ฿55\.00/ }).click()
  await expect(step2.getByLabel('จำนวนเงิน')).toHaveValue('55.00')
  await expect(step2.getByTestId('transaction-category-field').getByRole('button', { name: 'อาหาร', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await settled(page)
  await captureWholeSheet(step2, path.join(EVIDENCE_DIR, '19-reconcile-backfill.png'))

  await step2.getByRole('button', { name: /บันทึกส่วนที่เหลือ ฿305\.00/ }).click()
  const step3 = page.getByRole('dialog', { name: 'บันทึกยอดปรับ · make' })
  await expect(step3.getByText('รายจ่าย · หมวด ปรับยอดให้ตรงธนาคาร')).toBeVisible()
  await expect(step3.getByText('−฿305.00')).toBeVisible()
  await settled(page)
  await captureWholeSheet(step3, path.join(EVIDENCE_DIR, '20-reconcile-remainder.png'))
  await step3.getByRole('button', { name: 'บันทึกยอดปรับ ฿305.00' }).click()

  await expect(page.getByText('ปรับยอดแล้ว')).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => {
    const { data, error } = await adminClient().from('transactions').select('type, amount_satang, category, note').eq('user_id', userId).eq('account_id', accountId).eq('category', 'adjustment').single()
    if (error) throw error
    return data
  }).toEqual({ type: 'expense', amount_satang: 30_500, category: 'adjustment', note: 'ปรับยอดให้ตรงธนาคาร' })

  const { data: account, error: accountError } = await adminClient().from('accounts').select('reconciled_at').eq('id', accountId).eq('user_id', userId).single()
  if (accountError) throw accountError
  expect(account.reconciled_at).not.toBeNull()
  const { data: balances, error: balanceError } = await adminClient().rpc('account_balances')
  if (balanceError) throw balanceError
  expect(balances?.find((row: { account_id: string; balance_satang: number }) => row.account_id === accountId)?.balance_satang).toBe(1_255_200)

  await page.goto('/transactions')
  const backfillButton = page.getByRole('button', { name: 'ลงย้อนหลัง', exact: true }).first()
  await expect(backfillButton).toBeVisible()
  await backfillButton.click()
  const gapSheet = page.getByRole('dialog', { name: 'ลงรายการย้อนหลัง' })
  const gapDate = await gapSheet.getByLabel('เลือกวัน').inputValue()
  expect(gapDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await expect(gapSheet.getByText(/ลงทุน|ถอนจากพอร์ต/)).toHaveCount(0)
  await gapSheet.getByLabel('จำนวนเงิน').fill('12.34')
  await gapSheet.getByTestId('transaction-category-field').getByRole('button', { name: 'อาหาร', exact: true }).click()
  await gapSheet.getByLabel('ผู้รับ / ผู้จ่าย (ไม่บังคับ)').fill('รายการย้อนหลัง E2E')
  await gapSheet.getByRole('button', { name: 'บันทึก แล้วลงรายการต่อ' }).click()
  await expect(gapSheet.getByText('ลงแล้ว (1)')).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => {
    const { data, error } = await adminClient().from('transactions')
      .select('amount_satang, datetime')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('counterparty', 'รายการย้อนหลัง E2E')
      .single()
    if (error) throw error
    return { amount: data.amount_satang, day: new Date(data.datetime).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) }
  }).toEqual({ amount: 1_234, day: gapDate })
  expect(consoleErrors.filter((message) => /hydration/i.test(message))).toEqual([])
})
