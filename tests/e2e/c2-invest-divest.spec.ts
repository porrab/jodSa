import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { adminClient, findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'
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
  await resetAllUserData(userId)
  accountId = await seedAccount(userId, 'make', 'กสิกรไทย', '4415')
  await seedAccount(userId, 'Dime! Save', 'เกียรตินาคินภัทร', '9921')
})

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

test('C2 invest and divest persist one cash row each with opposite balance effects', async ({ page }) => {
  const probe = await adminClient().from('transactions').select('holding_id').limit(1)
  const missing0012 = !!probe.error && /holding_id|42703/i.test(`${probe.error.code} ${probe.error.message}`)
  if (probe.error && !missing0012) throw probe.error
  test.skip(missing0012, 'Live test DB lacks migration 0012 holding_id; owner approval is required before applying it')

  let sheet = await openTransfer(page)
  await sheet.getByLabel('จำนวนเงิน').fill('100.00')
  await sheet.getByRole('radiogroup', { name: 'บัญชีต้นทาง' }).getByRole('radio', { name: /make/ }).click()
  await sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' }).click()
  await sheet.getByRole('button', { name: 'บันทึกการลงทุน' }).click()
  await expect.poll(async () => {
    const { count } = await adminClient().from('transactions').select('*', { head: true, count: 'exact' }).eq('user_id', userId).eq('type', 'invest')
    return count
  }).toBe(1)

  sheet = await openTransfer(page)
  await sheet.getByLabel('จำนวนเงิน').fill('40.00')
  await sheet.getByRole('radiogroup', { name: 'บัญชีต้นทาง' }).getByRole('radio', { name: 'พอร์ตลงทุน' }).click()
  await sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: /make/ }).click()
  await sheet.getByRole('button', { name: 'บันทึกการถอนจากพอร์ต' }).click()
  await expect.poll(async () => {
    const { data } = await adminClient().from('transactions').select('type').eq('user_id', userId).in('type', ['invest', 'divest'])
    return data?.map((row) => row.type).sort()
  }).toEqual(['divest', 'invest'])
  const { data: balances, error } = await adminClient().rpc('account_balances')
  if (error) throw error
  expect((balances as { account_id: string; balance_satang: number }[] | null)
    ?.find((row) => row.account_id === accountId)?.balance_satang).toBe(-6_000)
})
