import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'
import { addTransaction } from './helpers/ui'

/**
 * QA-M7A — Edit a saved transaction (M7-A / design J3).
 *
 * The field report was "no way to edit a saved transaction" (updateTransaction did
 * not exist). This proves the create → edit → verify round-trip through the real
 * UI: row tap → detail sheet → แก้ไข → prefilled form → change fields → save →
 * the change persists across a reload. The RLS "B cannot update A" half is unit-
 * covered (rls.test.ts); this is the user-journey half.
 */

const ACCT = 'QA-M7A บัญชี'

test.use({ storageState: STORAGE_A })

test.beforeEach(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetAllUserData(user.id)
  await seedAccount(user.id, ACCT, 'KBank')
})

test('QA-M7A-1 create → edit amount + counterparty → change persists on reload', async ({ page }) => {
  // Create an expense (฿100.00) through the real form.
  await addTransaction(page, { type: 'expense', amount: '100', account: ACCT })
  await page.goto('/transactions')
  await expect(page.getByText(/100\.00/)).toHaveCount(1)

  // Row tap → detail sheet → แก้ไข (delete moved off the row into the sheet, J3).
  await page.getByText(/100\.00/).first().locator('xpath=ancestor::button[1]').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('button', { name: 'แก้ไข' })).toBeVisible()
  await sheet.getByRole('button', { name: 'แก้ไข' }).click()

  // Prefilled edit form — change the amount and set a counterparty.
  await sheet.getByLabel('จำนวนเงิน (บาท)').fill('175')
  await sheet.getByLabel('ผู้รับ / ผู้โอน').fill('ร้านทดสอบแก้ไข')
  await sheet.getByRole('button', { name: 'บันทึกรายการ' }).click()
  await expect(sheet).toBeHidden()

  // Persist check: reload and confirm the edited amount replaced the original
  // (not a second row) — create→edit must UPDATE, never duplicate.
  await page.goto('/transactions')
  await expect(page.getByText(/175\.00/)).toHaveCount(1)
  await expect(page.getByText(/100\.00/)).toHaveCount(0)

  // The non-amount field persisted too: reopen the detail sheet.
  await page.getByText(/175\.00/).first().locator('xpath=ancestor::button[1]').click()
  await expect(page.getByRole('dialog').getByText('ร้านทดสอบแก้ไข')).toBeVisible()
})
