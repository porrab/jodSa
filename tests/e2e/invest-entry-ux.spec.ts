import { expect, test } from '@playwright/test'
import { env, e2eBaseUrl } from './helpers/env'
import { findUserByEmail, testUserClient } from './helpers/admin'
import { login } from './helpers/ui'

test('entry converts invented THB fees before saving and checks net sell proceeds', async ({ browser }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing A')
  const db = await testUserClient(user.id)
  const broker = `entry-ux-${Date.now()}`
  const context = await browser.newContext({ baseURL: e2eBaseUrl, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  try {
    await login(page, env.userA.email, env.userA.password)
    await page.goto('/invest')
    await page.getByRole('button', { name: 'เพิ่มสินทรัพย์', exact: true }).click()
    let sheet = page.getByRole('dialog')
    await sheet.getByRole('combobox').first().click()
    await page.getByRole('option', { name: '(AAPL)' }).click()
    await sheet.locator('#h-broker').fill(broker)
    const toggle = sheet.getByRole('switch', { name: 'กรอกเป็นบาท', exact: true })
    await expect(toggle).toBeDisabled()
    await expect(sheet.getByText('กรอก FX ที่มากกว่า 0 ก่อน', { exact: false })).toBeVisible()
    await sheet.locator('#h-qty').fill('0.5000000')
    await sheet.locator('#h-price').fill('100.00')
    await sheet.locator('#h-fx').fill('34.00')
    await toggle.check()
    await sheet.locator('#h-fees').fill(',')
    expect(await sheet.locator('#h-fees').evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false)
    await sheet.locator('#h-fees').fill('4.08')
    await sheet.locator('#h-fx').fill('')
    await expect(toggle).toBeDisabled()
    await expect(toggle).not.toBeChecked()
    await expect(sheet.locator('#h-fees')).toHaveValue('0.12')
    await sheet.locator('#h-fx').fill('34.00')
    await toggle.check()
    await sheet.locator('#h-datetime').fill('2026-01-15T12:30')
    await expect(sheet.getByRole('status')).toContainText('50.12 USD ≈ 1704.08 ฿')
    await expect(sheet.locator('input[name="fees"]')).toHaveValue('0.12')
    await sheet.getByText('กรอกจากใบยืนยันคำสั่งซื้อยังไง?', { exact: true }).click()
    await expect(sheet.getByRole('table')).toBeVisible()
    await sheet.getByRole('button', { name: 'เพิ่มสินทรัพย์', exact: true }).click()
    await expect(sheet).toBeHidden()
    const { data: holding, error } = await db.from('holdings').select('id').eq('broker', broker).single()
    if (error) throw error
    const buy = await db.from('asset_transactions').select('fees_minor,fx_rate').eq('holding_id', holding.id).eq('type', 'buy').single()
    expect(buy.error).toBeNull()
    expect(Number(buy.data!.fees_minor)).toBe(12)
    expect(Number(buy.data!.fx_rate)).toBe(34)
    await page.goto(`/invest?holding=${holding.id}`)
    await page.getByRole('dialog').getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
    sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'ขาย', exact: true }).click()
    await sheet.locator('#tx-qty').fill('0.1')
    await sheet.locator('#tx-amount').fill('100.00')
    await sheet.locator('#tx-fees').fill('0.01')
    await sheet.locator('#tx-fx').fill('34.00')
    await sheet.locator('#tx-datetime').fill('2026-01-16T12:30')
    await expect(sheet.getByRole('status')).toContainText('9.99 USD ≈ 339.66 ฿')
    await sheet.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
    await expect(sheet.locator('#tx-qty')).toHaveCount(0)
    const sell = await db.from('asset_transactions').select('fees_minor').eq('holding_id', holding.id).eq('type', 'sell').single()
    expect(sell.error).toBeNull()
    expect(Number(sell.data!.fees_minor)).toBe(1)
  } finally {
    const { data } = await db.from('holdings').select('id').eq('broker', broker)
    for (const holding of data ?? []) {
      expect((await db.from('asset_transactions').delete().eq('holding_id', holding.id)).error).toBeNull()
      expect((await db.from('holdings').delete().eq('id', holding.id)).error).toBeNull()
    }
    await context.close()
  }
})

test('entry hints and mapping render in Thai/English and light/dark without overflow', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: e2eBaseUrl, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  try {
    await login(page, env.userA.email, env.userA.password)
    for (const locale of ['th', 'en']) {
      await page.goto('/settings')
      await page.getByRole('button', { name: locale === 'th' ? 'ไทย' : 'English', exact: true }).click()
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => localStorage.setItem('theme', theme), theme)
        await page.goto('/invest')
        await page.getByRole('button', { name: locale === 'th' ? 'เพิ่มสินทรัพย์' : 'Add Holding', exact: true }).click()
        const sheet = page.getByRole('dialog')
        await sheet.getByRole('combobox').first().click()
        await page.getByRole('option', { name: '(AAPL)' }).click()
        await expect(sheet.locator('#h-price-hint')).toContainText('ราคาที่ได้จริง')
        await expect(sheet.locator('#h-qty-hint')).toContainText('จำนวนหุ้น')
        await expect(sheet.locator('#h-datetime-hint')).toContainText('วันที่คำสั่งสำเร็จ')
        await expect(sheet.locator('#h-fx-hint')).toContainText('1 USD')
        await expect(sheet.getByRole('switch', { name: locale === 'th' ? 'กรอกเป็นบาท' : 'Enter fees in THB', exact: true })).toBeDisabled()
        await sheet.locator('summary').click()
        await expect(sheet.getByRole('table')).toBeVisible()
        expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
        await test.info().attach(`${locale}-${theme}-entry`, { body: await sheet.screenshot(), contentType: 'image/png' })
        await page.keyboard.press('Escape')
      }
    }
  } finally { await context.close() }
})
