import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { GENERATED_DIR, STORAGE_A } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

const EVIDENCE_DIR = path.resolve('tests/e2e/evidence/a3-2026-10-26/app')

async function ready(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => node.remove()))
}

test.beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
})

test('A3 manual form reveals an optional display name with live payee fallback', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'บันทึกรายการ' })

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
  await sheet.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await expect(fallback).toBeInViewport()
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '06-add-manual-a3-focus.png') })
})

test('A3 transfer gets a display name without adding a payee field', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'บันทึกรายการ' })
  await sheet.getByRole('button', { name: 'โอนเงิน', exact: true }).click()
  await expect(sheet.getByLabel('ผู้รับ / ผู้จ่าย (ไม่บังคับ)')).toHaveCount(0)
  await sheet.getByRole('button', { name: '+ ตั้งชื่อที่แสดงเอง' }).click()
  await expect(sheet.getByText('ไม่ใส่ = แสดงบัญชีปลายทาง')).toBeVisible()
  await sheet.getByLabel('ชื่อที่แสดง (ไม่บังคับ)').fill('เก็บค่าเทอม')
})

test('A3 slip confirmation keeps the parsed payee visible and offers display name', async ({ page }) => {
  test.setTimeout(600_000)
  await page.goto('/import')
  await page.locator('input[type="file"]').setInputFiles(path.join(GENERATED_DIR, 'slip-qr-a.png'))
  await expect(page.getByTestId('slip-category-field')).toBeVisible({ timeout: 480_000 })
  const payee = page.locator('input[name="counterparty"]')
  await expect(payee).toBeVisible()
  await page.getByRole('button', { name: '+ ตั้งชื่อที่แสดงเอง' }).click()
  await expect(page.getByLabel('ชื่อที่แสดง (ไม่บังคับ)')).toBeVisible()
  const payeeValue = await payee.inputValue()
  if (payeeValue) {
    await expect(page.getByText(`ไม่ใส่ = แสดงเป็น "${payeeValue}"`)).toBeVisible()
  }
})
