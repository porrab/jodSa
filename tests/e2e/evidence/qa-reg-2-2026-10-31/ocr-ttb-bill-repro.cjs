const path = require('node:path')
const { chromium } = require('@playwright/test')
const root = path.resolve(__dirname, '../../../..')
const corpus = path.resolve(root, '../../qa-lab/projects/jodsa/corpus')
async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState: path.join(root, 'tests/e2e/.auth/userA.json'), viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  for (const [file, expected] of [['BillPayment_20260522_132356.jpg', 30], ['BillPayment_20260521_115411.jpg', 60]]) {
    await page.goto('/import')
    await page.waitForLoadState('networkidle')
    await page.locator('input[type="file"]').setInputFiles(path.join(corpus, file))
    await page.getByText('วางภาพสลิปที่นี่').waitFor({ state: 'hidden', timeout: 10000 })
    await page.getByRole('button', { name: 'ยืนยันและบันทึก' }).waitFor({ timeout: 240000 })
    const amount = await page.locator('input[name="amount"]').inputValue()
    console.log(JSON.stringify({ file, expected, actual: amount, errors: errors.splice(0) }))
    await page.locator('input[name="amount"]').screenshot({ path: path.join(__dirname, `ttb-${expected}-amount.png`) })
  }
  await context.close()
  await browser.close()
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
