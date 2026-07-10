import { test, expect, type Page } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'

/**
 * M3-S2 — Recurring rule materializes lazily on read; a deleted occurrence must
 * not be recreated on the next read. Maps to M3-AC1 ("deleting an occurrence +
 * re-reading does not recreate it") + lazy-on-read materialization.
 *
 * The date math is unit-covered (recurrence.test.ts). This spec proves the
 * integration the unit tests can't: materialize-on-load and the skip/exception
 * round-trip through the real UI — the only affordance a user has to remove a
 * generated occurrence.
 */

const ACCT = 'QA-M3 บัญชีประจำ'
const AMOUNT = '97' // distinctive amount so occurrence rows are easy to count
const AMOUNT_TEXT = '฿97.00'

test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetAllUserData(user.id)
  await seedAccount(user.id, ACCT, 'SCB') // becomes accounts[0] → default in the rule form
})

async function createWeeklyRule(page: Page, amountBaht: string, startDate: string): Promise<void> {
  await page.goto('/recurring')
  await page.getByRole('button', { name: 'เพิ่มรายการประจำ' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill(amountBaht)
  // freq Select defaults to รายเดือน (monthly) → switch to รายสัปดาห์ (weekly)
  await dialog.getByRole('combobox').filter({ hasText: 'รายเดือน' }).click()
  await page.getByRole('option', { name: 'รายสัปดาห์' }).click()
  // type defaults to รายจ่าย, account defaults to accounts[0], interval to 1,
  // weekday left empty → uses the start weekday
  await dialog.getByLabel('วันเริ่ม').fill(startDate)
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(dialog).toBeHidden()
}

test('M3-S2 deleting a generated occurrence is not recreated on reload', async ({ page }) => {
  // Start on the 1st of the current month so several weekly occurrences fall in
  // the materialization window (current-month range).
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
  await createWeeklyRule(page, AMOUNT, `${month}-01`)

  // Lazy-on-read: opening transactions materializes the due occurrences.
  await page.goto('/transactions')
  const rows = page.getByText(AMOUNT_TEXT)
  await expect(rows.first()).toBeVisible()
  const before = await rows.count()
  // M7-D: materialization now clamps to today (Asia/Bangkok) instead of
  // generating the whole month up front (design J7 — money must not look spent
  // before its due date), so a weekly rule starting on the 1st only has as many
  // occurrences as weeks have elapsed so far this month — at least 1, not
  // necessarily "several" the way the old whole-month materialization gave.
  expect(before, 'weekly rule should materialize at least one due occurrence this month').toBeGreaterThanOrEqual(1)

  // Delete one occurrence through the ONLY user affordance: row tap → detail
  // sheet → ลบรายการ (M7-A / design J3 — delete moved off the list row into the
  // sheet). The list doesn't optimistically update — it re-reads on navigation —
  // so we wait for the success toast to know the delete server action completed.
  const firstRow = page.getByText(AMOUNT_TEXT).first().locator('xpath=ancestor::button[1]')
  await firstRow.click()
  page.once('dialog', (d) => d.accept()) // confirm "ข้ามรายการประจำนี้?" (occurrence skip)
  await page.getByRole('button', { name: 'ลบรายการ' }).click()
  // an occurrence is skipped (delete + exception), not plainly deleted — distinct toast
  await expect(page.getByText('ข้ามรายการประจำแล้ว')).toBeVisible()

  // Re-read: materialize runs again on load. The deleted occurrence must stay
  // gone — i.e. a recurring_exceptions row should have been written so lazy-on-read
  // never recreates it (M3-AC1). If it reappears (count back to `before`), the
  // delete path didn't record the skip and the occurrence was regenerated.
  await page.goto('/transactions')
  await expect(page.getByText(AMOUNT_TEXT)).toHaveCount(before - 1)
})
