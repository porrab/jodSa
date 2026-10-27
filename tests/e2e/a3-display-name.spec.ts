import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { GENERATED_DIR, STORAGE_A } from './helpers/env'
import { adminClient, findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'
import { env } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

const EVIDENCE_DIR = path.resolve('tests/e2e/evidence/a3-2026-10-26/app')
let userId = ''
let sourceAccountId = ''
let destinationAccountId = ''

async function ready(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => node.remove()))
}

test.beforeAll(async () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`Test user A is missing: ${env.userA.email}`)
  userId = user.id
  await resetAllUserData(userId)
  sourceAccountId = await seedAccount(userId, 'make', 'กสิกรไทย')
  destinationAccountId = await seedAccount(userId, 'Dime! Save', 'เกียรตินาคินภัทร')
})

async function openAdd(page: Page) {
  await page.goto('/transactions')
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  return page.getByRole('dialog', { name: 'บันทึกรายการ' })
}

async function waitForTransaction(match: Record<string, unknown>) {
  await expect.poll(async () => {
    let query = adminClient().from('transactions').select('id, note, counterparty, type, account_id, to_account_id').eq('user_id', userId)
    for (const [column, value] of Object.entries(match)) query = query.eq(column, value)
    const { data, error } = await query.limit(1).maybeSingle()
    if (error) throw error
    return data
  }, { timeout: 20_000 }).not.toBeNull()
}

test('A3 expense persists display name, edits it, then clears it back to payee and NULL', async ({ page }) => {
  const sheet = await openAdd(page)

  await sheet.getByLabel('จำนวนเงิน').fill('1250.00')
  await sheet.getByTestId('transaction-category-field').getByRole('button', { name: 'อาหาร', exact: true }).click()
  await sheet.getByLabel('ผู้รับ / ผู้จ่าย (ไม่บังคับ)').fill('ร้านสุกี้ตี๋น้อย สาขาพระราม 9')
  await sheet.getByRole('button', { name: '+ ตั้งชื่อที่แสดงเอง' }).click()

  const note = sheet.getByLabel('ชื่อที่แสดง (ไม่บังคับ)')
  await expect(note).toBeVisible()
  const fallback = sheet.getByText('ไม่ใส่ = แสดงเป็น "ร้านสุกี้ตี๋น้อย สาขาพระราม 9"')
  await expect(fallback).toBeVisible()
  await note.fill('ก'.repeat(101))
  await expect(sheet.getByText('101/120')).toBeVisible()
  await note.fill('ข้าวเย็นกับแม่')
  await ready(page)
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '06-add-manual-a3-full.png'), fullPage: true })
  await sheet.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()

  await waitForTransaction({ type: 'expense', account_id: sourceAccountId, counterparty: 'ร้านสุกี้ตี๋น้อย สาขาพระราม 9', note: 'ข้าวเย็นกับแม่' })
  await page.goto('/transactions')
  const created = page.getByTestId(/transaction-.*-copy/).filter({ hasText: 'ข้าวเย็นกับแม่' }).first()
  await expect(created.getByText('ข้าวเย็นกับแม่', { exact: true })).toBeVisible()
  await expect(created).toContainText('ร้านสุกี้ตี๋น้อย สาขาพระราม 9')

  await created.locator('..').locator('..').click()
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click()
  await page.getByLabel('ชื่อที่แสดง (ไม่บังคับ)').fill('มื้อฉลองวันเกิด')
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()
  await waitForTransaction({ type: 'expense', note: 'มื้อฉลองวันเกิด' })

  await page.goto('/transactions')
  const edited = page.getByTestId(/transaction-.*-copy/).filter({ hasText: 'มื้อฉลองวันเกิด' }).first()
  await edited.locator('..').locator('..').click()
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click()
  await page.getByRole('button', { name: 'ลบ', exact: true }).click()
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()

  await expect.poll(async () => {
    const { data, error } = await adminClient().from('transactions').select('note').eq('user_id', userId).eq('type', 'expense').single()
    if (error) throw error
    return data.note
  }).toBeNull()
  await page.goto('/transactions')
  await expect(page.getByTestId(/transaction-.*-copy-title/).filter({ hasText: 'ร้านสุกี้ตี๋น้อย สาขาพระราม 9' })).toBeVisible()
})

test('A3 transfer persists, edits, and clears display name back to destination', async ({ page }) => {
  const sheet = await openAdd(page)
  await sheet.getByRole('button', { name: 'โอนเงิน', exact: true }).click()
  await expect(sheet.getByLabel('ผู้รับ / ผู้จ่าย (ไม่บังคับ)')).toHaveCount(0)
  await sheet.getByLabel('จำนวนเงิน').fill('500.00')
  await sheet.getByRole('radiogroup', { name: 'บัญชีปลายทาง' }).getByRole('radio', { name: /Dime! Save/ }).click()
  await sheet.getByRole('button', { name: '+ ตั้งชื่อที่แสดงเอง' }).click()
  await expect(sheet.getByText('ไม่ใส่ = แสดงบัญชีปลายทาง')).toBeVisible()
  await sheet.getByLabel('ชื่อที่แสดง (ไม่บังคับ)').fill('เก็บค่าเทอม')
  await sheet.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()

  await waitForTransaction({ type: 'transfer', account_id: sourceAccountId, to_account_id: destinationAccountId, note: 'เก็บค่าเทอม' })
  await page.goto('/transactions')
  const created = page.getByTestId(/transaction-.*-copy/).filter({ hasText: 'เก็บค่าเทอม' }).first()
  await expect(created).toContainText('make')
  await created.locator('..').locator('..').click()
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click()
  await page.getByLabel('ชื่อที่แสดง (ไม่บังคับ)').fill('โอนไปเก็บ')
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()
  await waitForTransaction({ type: 'transfer', note: 'โอนไปเก็บ' })

  await page.goto('/transactions')
  const edited = page.getByTestId(/transaction-.*-copy/).filter({ hasText: 'โอนไปเก็บ' }).first()
  await edited.locator('..').locator('..').click()
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click()
  await page.getByRole('button', { name: 'ลบ', exact: true }).click()
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()
  await expect.poll(async () => {
    const { data, error } = await adminClient().from('transactions').select('note').eq('user_id', userId).eq('type', 'transfer').single()
    if (error) throw error
    return data.note
  }).toBeNull()
  await page.goto('/transactions')
  await expect(page.getByTestId(/transaction-.*-copy-title/).filter({ hasText: '→ Dime! Save' })).toBeVisible()
})

test('A3 rejects a 121-character display name without persisting it', async ({ page }) => {
  const before = await adminClient().from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  const sheet = await openAdd(page)
  await sheet.getByLabel('จำนวนเงิน').fill('99.00')
  await sheet.getByTestId('transaction-category-field').getByRole('button', { name: 'อาหาร', exact: true }).click()
  await sheet.getByRole('button', { name: '+ ตั้งชื่อที่แสดงเอง' }).click()
  await sheet.getByLabel('ชื่อที่แสดง (ไม่บังคับ)').fill('ก'.repeat(121))
  await expect(sheet.getByText('121/120')).toBeVisible()
  await sheet.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'บันทึกรายการ' })).toBeVisible()
  await expect(page.getByText(/120/).last()).toBeVisible()
  await expect.poll(async () => {
    const result = await adminClient().from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    return result.count
  }).toBe(before.count)
})

test('A3 slip confirmation exposes display name without writing a transaction', async ({ page }) => {
  test.setTimeout(600_000)
  const before = await adminClient().from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  if (before.error) throw before.error

  await page.goto('/import')
  await page.locator('input[type="file"]').setInputFiles(path.join(GENERATED_DIR, 'slip-qr-a.png'))
  await expect(page.getByTestId('slip-category-field')).toBeVisible({ timeout: 480_000 })
  const payee = page.locator('input[name="counterparty"]')
  await expect(payee).toBeVisible()
  await page.getByRole('button', { name: '+ ตั้งชื่อที่แสดงเอง' }).click()
  await expect(page.getByLabel('ชื่อที่แสดง (ไม่บังคับ)')).toBeVisible()
  const payeeValue = await payee.inputValue()
  if (payeeValue) await expect(page.getByText(`ไม่ใส่ = แสดงเป็น "${payeeValue}"`)).toBeVisible()

  const after = await adminClient().from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  if (after.error) throw after.error
  expect(after.count).toBe(before.count)
})
