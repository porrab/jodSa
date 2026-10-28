import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { adminClient, findUserByEmail, resetAllUserData, resetInvestData, seedAccount, seedInvestHolding, seedTransaction } from './helpers/admin'
import { env, STORAGE_A } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })

const evidence = path.resolve('tests/e2e/evidence/c2-2026-10-28')
let userId = ''
let accountId = ''

test.beforeAll(async () => {
  fs.mkdirSync(evidence, { recursive: true })
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`Test user A is missing: ${env.userA.email}`)
  userId = user.id
})

test.beforeEach(async () => {
  await resetInvestData(userId)
  await resetAllUserData(userId)
  accountId = await seedAccount(userId, 'make', 'กสิกรไทย', '4415')
  await seedAccount(userId, 'Dime! Save', 'เกียรตินาคินภัทร', '9921')
})

test.afterEach(async () => {
  await resetAllUserData(userId)
  await resetInvestData(userId)
})

async function balanceFor(account: string): Promise<number> {
  const { data, error } = await adminClient().rpc('account_balances')
  if (error) throw error
  return (data as { account_id: string; balance_satang: number }[]).find((row) => row.account_id === account)?.balance_satang ?? 0
}

async function selectHolding(sheet: import('@playwright/test').Locator, id: string, symbol: string) {
  const nativeSelect = sheet.getByLabel('สินทรัพย์ (ไม่บังคับ)')
  if (await nativeSelect.count()) await nativeSelect.selectOption(id)
  else await sheet.getByRole('radiogroup', { name: 'สินทรัพย์ (ไม่บังคับ)' }).getByRole('radio', { name: symbol }).click()
}

async function openTransfer(page: import('@playwright/test').Page) {
  await page.goto('/transactions')
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'บันทึกรายการ' })
  await sheet.getByRole('button', { name: 'โอนเงิน', exact: true }).click()
  return sheet
}

test('C2 invest tile sits in ไปที่ and excludes expense language', async ({ page }) => {
  const sheet = await openTransfer(page)
  await sheet.getByRole('radiogroup', { name: 'บัญชีต้นทาง' }).getByRole('radio', { name: /make/ }).click()
  await sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' }).click()
  await expect(sheet.getByRole('radiogroup', { name: 'บัญชีต้นทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' })).toHaveCount(0)
  await expect(sheet.getByText('ไม่นับเป็นรายจ่าย · ยอดบัญชีจะลดลง')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'บันทึกการลงทุน' })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, 'app-invest-top.png') })
  await sheet.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await page.screenshot({ path: path.join(evidence, 'app-invest-bottom.png') })
})

test('C2 divest tile sits in จากบัญชี and excludes income language', async ({ page }) => {
  const sheet = await openTransfer(page)
  await sheet.getByRole('radiogroup', { name: 'บัญชีต้นทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' }).click()
  await expect(sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' })).toHaveCount(0)
  await sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: /make/ }).click()
  await expect(sheet.getByText('ไม่นับเป็นรายรับ · ยอดบัญชีจะเพิ่มขึ้น')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'บันทึกการถอนจากพอร์ต' })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, 'app-divest-top.png') })
  await sheet.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await page.screenshot({ path: path.join(evidence, 'app-divest-bottom.png') })
})

test('C2 one-account transfer offers both portfolio and add-account', async ({ page }) => {
  await resetAllUserData(userId)
  accountId = await seedAccount(userId, 'make', 'กสิกรไทย', '4415')
  const sheet = await openTransfer(page)
  const destination = sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' })
  await expect(destination.getByRole('radio', { name: 'พอร์ตลงทุน' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: '+ สร้างบัญชี' })).toBeVisible()
  await expect(sheet.getByText('ต้องมีอย่างน้อย 2 บัญชีเพื่อโอนเงินระหว่างกัน')).toBeVisible()
})

test('C2 invest and divest persist one cash row each with opposite balance effects', async ({ page }) => {
  const holdingId = await seedInvestHolding(userId, { symbol: 'PTT', currentValueMinor: '100000', ledger: [{ type: 'buy', qty: '1', priceMinor: '100000', datetime: '2026-10-01T07:00:00Z' }] })
  await seedTransaction(userId, accountId, { amountSatang: 2500, category: 'food' })
  await page.goto('/dashboard')
  const budgetBefore = await page.getByTestId('home-budget').innerText()
  await page.goto('/transactions')
  const dayTotalBefore = await page.getByText('จ่าย ฿25.00').count()
  expect(dayTotalBefore).toBe(1)
  const balanceBefore = await balanceFor(accountId)

  let sheet = await openTransfer(page)
  await sheet.getByLabel('จำนวนเงิน').fill('100.00')
  await sheet.getByRole('radiogroup', { name: 'บัญชีต้นทาง' }).getByRole('radio', { name: /make/ }).click()
  await sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' }).click()
  await selectHolding(sheet, holdingId, 'PTT')
  await sheet.getByRole('button', { name: 'บันทึกการลงทุน' }).click()
  await expect.poll(async () => {
    const { count } = await adminClient().from('transactions').select('*', { head: true, count: 'exact' }).eq('user_id', userId).eq('type', 'invest')
    return count
  }).toBe(1)
  const { data: investRows, error: investError } = await adminClient().from('transactions').select('id, account_id, holding_id, asset_transaction_id, amount_satang').eq('user_id', userId).eq('type', 'invest')
  if (investError) throw investError
  expect(investRows).toHaveLength(1)
  expect(investRows?.[0]).toMatchObject({ account_id: accountId, holding_id: holdingId, asset_transaction_id: null, amount_satang: 10_000 })
  expect(await balanceFor(accountId)).toBe(balanceBefore - 10_000)
  await page.goto('/transactions')
  await expect(page.getByText('จ่าย ฿25.00')).toHaveCount(1)
  await page.goto('/dashboard')
  expect(await page.getByTestId('home-budget').innerText()).toBe(budgetBefore)

  sheet = await openTransfer(page)
  await sheet.getByLabel('จำนวนเงิน').fill('40.00')
  await sheet.getByRole('radiogroup', { name: 'บัญชีต้นทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' }).click()
  await sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: /make/ }).click()
  await sheet.getByRole('button', { name: 'บันทึกการถอนจากพอร์ต' }).click()
  await expect.poll(async () => {
    const { data } = await adminClient().from('transactions').select('type').eq('user_id', userId).in('type', ['invest', 'divest'])
    return data?.map((row) => row.type).sort()
  }).toEqual(['divest', 'invest'])
  expect(await balanceFor(accountId)).toBe(balanceBefore - 6_000)
  const { data: incomeRows, error: incomeError } = await adminClient().from('transactions').select('amount_satang').eq('user_id', userId).eq('type', 'income')
  if (incomeError) throw incomeError
  expect(incomeRows).toHaveLength(0)
  await page.goto('/transactions')
  await expect(page.getByText('จ่าย ฿25.00')).toHaveCount(1)
  await page.goto('/dashboard')
  expect(await page.getByTestId('home-budget').innerText()).toBe(budgetBefore)
})

test('C2 funded buy links only its buy; deletion preserves the cash debit', async ({ page }) => {
  const holdingId = await seedInvestHolding(userId, { symbol: 'PTT', currentValueMinor: '100000', ledger: [{ type: 'buy', qty: '1', priceMinor: '100000', datetime: '2026-10-01T07:00:00Z' }] })
  const balanceBefore = await balanceFor(accountId)
  await page.goto('/invest')
  await page.getByRole('button', { name: /ปตท/ }).click()
  const detail = page.getByRole('dialog').first()
  await detail.getByRole('button', { name: 'เพิ่มรายการ' }).click()
  const addSheet = page.getByRole('dialog', { name: 'เพิ่มรายการ' })
  await addSheet.locator('#tx-qty').fill('1')
  await addSheet.locator('#tx-amount').fill('100')
  await addSheet.locator('#tx-datetime').fill('2026-10-29T12:00')
  await addSheet.getByRole('button', { name: /ตัดเงินจากบัญชีใน JodSa/ }).click()
  await addSheet.getByRole('radiogroup', { name: 'บัญชีที่ตัดเงิน' }).getByRole('radio', { name: /make/ }).click()
  await expect(addSheet.locator('#tx-cash-amount')).toHaveValue('100.00')
  await addSheet.getByRole('button', { name: 'เพิ่มรายการ' }).click()
  await expect(addSheet).toBeHidden()
  const { data: buys, error: buyError } = await adminClient().from('asset_transactions').select('id').eq('user_id', userId).eq('holding_id', holdingId).eq('type', 'buy')
  if (buyError) throw buyError
  expect(buys).toHaveLength(2)
  const { data: cashRows, error: cashError } = await adminClient().from('transactions').select('id, holding_id, asset_transaction_id, amount_satang').eq('user_id', userId).eq('type', 'invest')
  if (cashError) throw cashError
  expect(cashRows).toHaveLength(1)
  const linkedBuyId = cashRows![0].asset_transaction_id
  const originalBuyId = buys?.find((buy) => buy.id !== linkedBuyId)?.id
  expect(cashRows?.[0]).toMatchObject({ holding_id: holdingId, asset_transaction_id: linkedBuyId, amount_satang: 10_000 })
  expect(await balanceFor(accountId)).toBe(balanceBefore - 10_000)
  await page.goto(`/invest?holding=${holdingId}`)
  const buyRows = page.getByRole('dialog').first().getByRole('button', { name: /ซื้อ/ })
  await expect(buyRows).toHaveCount(2)
  await expect(buyRows.filter({ hasText: 'ตัดจาก make ฿100.00' })).toHaveCount(1)
  await expect(buyRows.filter({ hasText: 'ตัดจาก make ฿100.00' })).toContainText('ตัดจาก make ฿100.00')
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).not.toContain('รายการโอนเงินที่ผูกไว้ยังอยู่')
    await dialog.dismiss()
  })
  await buyRows.filter({ hasNotText: 'ตัดจาก make ฿100.00' }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'ลบ', exact: true }).click()
  await page.keyboard.press('Escape')
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('รายการโอนเงินที่ผูกไว้ยังอยู่ — ลบแยกได้ที่หน้ารายการ')
    await dialog.accept()
  })
  await buyRows.filter({ hasText: 'ตัดจาก make ฿100.00' }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'ลบ', exact: true }).click()
  await expect.poll(async () => {
    const { data, error } = await adminClient().from('transactions').select('asset_transaction_id').eq('id', cashRows![0].id).single()
    if (error) throw error
    return data.asset_transaction_id
  }).toBeNull()
  const { count: remainingBuys, error: remainingError } = await adminClient().from('asset_transactions').select('id', { head: true, count: 'exact' }).eq('user_id', userId).eq('holding_id', holdingId).eq('type', 'buy')
  if (remainingError) throw remainingError
  expect(remainingBuys).toBe(1)
  expect(await balanceFor(accountId)).toBe(balanceBefore - 10_000)
  expect(originalBuyId).not.toBe(linkedBuyId)
})

test('C2 divest from portfolio closes a negative C1 reconcile gap', async ({ page }) => {
  await page.goto('/accounts')
  await page.getByRole('button', { name: /make.*฿0\.00/ }).click()
  await page.getByRole('button', { name: /ปรับยอดให้ตรงธนาคาร/ }).click()
  const firstStep = page.getByRole('dialog', { name: 'ปรับยอดให้ตรงธนาคาร · make' })
  await firstStep.getByLabel('ยอดในแอปธนาคารตอนนี้').fill('50.00')
  await expect(firstStep.getByText(/ธนาคาร.*฿50\.00/)).toBeVisible()
  await firstStep.getByRole('button', { name: 'ลงรายการที่ขาด' }).click()
  const secondStep = page.getByRole('dialog', { name: 'ลงรายการที่ขาด · make' })
  await secondStep.getByRole('button', { name: 'โอนเงิน', exact: true }).click()
  await secondStep.getByRole('radiogroup', { name: 'บัญชีต้นทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' }).click()
  await secondStep.getByLabel('จำนวนเงิน').fill('50.00')
  await secondStep.getByRole('button', { name: 'บันทึก แล้วลงรายการต่อ' }).click()
  await expect(secondStep).toBeHidden({ timeout: 20_000 })
  expect(await balanceFor(accountId)).toBe(5_000)
  const { data, error } = await adminClient().from('transactions').select('type, account_id, amount_satang').eq('user_id', userId)
  if (error) throw error
  expect(data).toEqual([{ type: 'divest', account_id: accountId, amount_satang: 5_000 }])
})
