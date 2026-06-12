import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'
import { addTransaction } from './helpers/ui'

/**
 * M3-S3 — Group total = sum of the group's EXPENSE members; a transfer that is a
 * member must NOT count toward the total. Maps to M3-AC4 (group totals correct).
 *
 * groupExpenseTotal is unit-covered; this spec proves the end-to-end path —
 * assigning real transactions via setTransactionGroup and rendering the group
 * detail total/breakdown.
 */

const ACCT_X = 'QA-M3 ทริป X'
const ACCT_Y = 'QA-M3 ทริป Y'
const GROUP = 'QA-M3 ทริปเชียงใหม่'

test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetAllUserData(user.id)
  await seedAccount(user.id, ACCT_X, 'SCB')
  await seedAccount(user.id, ACCT_Y, 'KBank') // transfer destination
})

async function assignCandidate(dialog: ReturnType<Page['getByRole']>, amountText: string): Promise<void> {
  const row = dialog.getByText(amountText).first().locator('xpath=ancestor::div[contains(@class,"p-3")][1]')
  await row.getByRole('button').click()
  // router.refresh() removes the now-assigned candidate from the dialog
  await expect(dialog.getByText(amountText)).toHaveCount(0)
}

test('M3-S3 group total sums expense members only; a transfer member is excluded', async ({ page }) => {
  await addTransaction(page, { type: 'expense', amount: '400', account: ACCT_X })
  await addTransaction(page, { type: 'expense', amount: '900', account: ACCT_X })
  await addTransaction(page, { type: 'transfer', amount: '1000', account: ACCT_X, toAccount: ACCT_Y })

  // Create the group
  await page.goto('/groups')
  await page.getByRole('button', { name: 'เพิ่มกลุ่ม' }).click()
  const createDialog = page.getByRole('dialog')
  await createDialog.getByLabel('ชื่อกลุ่ม/ทริป').fill(GROUP)
  await createDialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(createDialog).toBeHidden()

  // Open the group detail
  await page.getByText(GROUP).click()
  await page.waitForURL('**/groups/*')

  // Assign all three transactions (two expenses + one transfer) to the group
  await page.getByRole('button', { name: 'เพิ่มรายการ' }).click()
  const addDialog = page.getByRole('dialog')
  await assignCandidate(addDialog, '-฿400.00')
  await assignCandidate(addDialog, '-฿900.00')
  await assignCandidate(addDialog, '฿1,000.00') // transfer has no +/- prefix
  await page.keyboard.press('Escape')

  // Total = 400 + 900 = 1,300 (transfer excluded), but all 3 are members.
  // If the transfer had counted, the total would read ฿2,300.00.
  await expect(page.getByText('฿1,300.00').first()).toBeVisible()
  await expect(page.getByText('รายการในกลุ่ม (3)')).toBeVisible()
})
