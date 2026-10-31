const path = require('node:path')
const { chromium } = require('@playwright/test')
const root = path.resolve(__dirname, '../../../..')
const corpus = path.resolve(root, '../../qa-lab/projects/jodsa/corpus')
const fixture = '1779600297906.jpg'
async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    baseURL: 'http://localhost:3100',
    storageState: path.join(root, 'tests/e2e/.auth/userA.json'),
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push({ kind: 'pageerror', message: error.message }))
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ kind: 'console', message: message.text() }) })
  page.on('requestfailed', (request) => errors.push({ kind: 'network', url: request.url(), reason: request.failure()?.errorText }))
  page.on('response', (response) => { if (response.status() >= 400) errors.push({ kind: 'http', url: response.url(), status: response.status() }) })
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto('/import')
    await page.waitForLoadState('networkidle')
    await page.locator('input[type="file"]').setInputFiles(path.join(corpus, fixture))
    const uploadAccepted = await page.getByText('วางภาพสลิปที่นี่').waitFor({ state: 'hidden', timeout: 10000 }).then(() => true).catch(() => false)
    const reachedConfirm = uploadAccepted && await page.getByRole('button', { name: 'ยืนยันและบันทึก' }).waitFor({ timeout: 240000 }).then(() => true).catch(() => false)
    const result = { attempt, fixture, uploadAccepted, reachedConfirm, amount: reachedConfirm ? await page.locator('input[name="amount"]').inputValue() : null, visibleStatus: reachedConfirm ? 'confirm' : (await page.locator('body').innerText()).slice(-500), errors: errors.splice(0) }
    if (!reachedConfirm) await page.screenshot({ path: path.join(__dirname, `ocr-repro-${attempt}.png`), fullPage: true })
    console.log(JSON.stringify(result))
  }
  await context.close()
  await browser.close()
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
