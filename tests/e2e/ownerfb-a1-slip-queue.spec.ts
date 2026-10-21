import path from 'node:path'
import { test, expect } from '@playwright/test'
import { env, GENERATED_DIR, STORAGE_B } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

const SLIP_A = path.join(GENERATED_DIR, 'slip-qr-a.png')
const SLIP_B = path.join(GENERATED_DIR, 'slip-qr-b.png')

test.use({ storageState: STORAGE_B })
test.describe.configure({ mode: 'serial' })

let userId: string

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userB.email)
  if (!user) throw new Error(`test user B missing: ${env.userB.email}`)
  userId = user.id
})

test.beforeEach(async () => {
  await resetUserData(userId)
  await seedAccount(userId, 'QA-A1', 'SCB')
})

test('OWNER-FB A1 Home opens two slips in the global sheet and bulk-saves ready rows', async ({ page }) => {
  test.setTimeout(600_000)
  await page.goto('/dashboard')

  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'สแกนสลิป' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles([SLIP_A, SLIP_B])

  const sheet = page.getByRole('dialog', { name: 'บันทึกรายการ' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('tab', { name: 'สลิป' })).toHaveAttribute('aria-selected', 'true')
  await expect(sheet.getByText(/สลิป 2 ใบ · อ่านแล้ว 2\/2/).first()).toBeVisible({ timeout: 480_000 })
  await expect(page).toHaveURL(/\/dashboard/)

  const bulkSave = sheet.getByRole('button', { name: 'บันทึกที่พร้อมแล้วทั้งหมด (2)' })
  await expect(bulkSave).toBeVisible()
  await bulkSave.click()
  await expect(sheet.getByText('บันทึกแล้ว')).toHaveCount(2, { timeout: 60_000 })

  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()
  await page.goto('/transactions')
  await expect(page.getByText('฿1,250.00').first()).toBeVisible()
  await expect(page.getByText('฿2,340.50').first()).toBeVisible()
})

test('OWNER-FB A1 manual fallback saves one failed item and warns before discarding the other', async ({ page }) => {
  await page.goto('/dashboard')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'สแกนสลิป' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles([
    { name: 'broken-1.png', mimeType: 'image/png', buffer: Buffer.from('not-an-image-1') },
    { name: 'broken-2.png', mimeType: 'image/png', buffer: Buffer.from('not-an-image-2') },
  ])

  const sheet = page.getByRole('dialog', { name: 'บันทึกรายการ' })
  await expect(sheet.getByText('อ่านไม่ได้')).toHaveCount(2, { timeout: 30_000 })
  await sheet.getByRole('button', { name: 'กรอกเอง' }).first().click()
  await sheet.getByLabel('จำนวนเงิน (บาท)').fill('99.00')
  await sheet.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()
  await expect(sheet.getByText('บันทึกแล้ว')).toBeVisible({ timeout: 30_000 })

  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet.getByText(/ยังมีสลิปที่ยังไม่บันทึก 1 ใบ/)).toBeVisible()
  await sheet.getByRole('button', { name: 'กลับไปบันทึก' }).click()
  await expect(sheet.getByText(/ยังมีสลิปที่ยังไม่บันทึก 1 ใบ/)).toBeHidden()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await sheet.getByRole('button', { name: 'ปิดทิ้ง' }).click()
  await expect(sheet).toBeHidden()
})

test('OWNER-FB A1 /transactions uses the same global add sheet', async ({ page }) => {
  await page.goto('/transactions')
  await page.getByRole('button', { name: 'เพิ่มรายการ' }).click()
  const sheet = page.getByRole('dialog', { name: 'บันทึกรายการ' })
  await expect(sheet.getByRole('tab', { name: 'กรอกเอง' })).toHaveAttribute('aria-selected', 'true')
  await expect(sheet.getByRole('tab', { name: 'สลิป' })).toBeVisible()
})
