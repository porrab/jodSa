import path from 'node:path'
import { expect, test } from '@playwright/test'
import { env, GENERATED_DIR, STORAGE_A } from './helpers/env'
import { findUserByEmail, testUserClient } from './helpers/admin'
import th from '../../messages/th.json'

const KEY = 'M12-FAKE-KEY-NEVER-SEND-TO-JODSA'
test.use({ storageState: STORAGE_A })
test.beforeEach(async ({ page }) => {
  await page.route('https://vision.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'Amount 432.10 THB' } }] }) }))
})
test.afterEach(async ({ page }) => { if (page.url().startsWith('http')) await page.evaluate(() => localStorage.clear()) })

test('M12 acknowledgement, persistence and removal', async ({ page }) => {
  await page.goto('/settings')
  const toggle = page.getByRole('switch', { name: th.vision.enable })
  await toggle.click(); await expect(toggle).not.toBeChecked()
  const accept = page.getByRole('button', { name: th.vision.accept }); await expect(accept).toBeDisabled()
  await page.getByRole('checkbox', { name: th.vision.ack }).check(); await accept.click()
  await expect(toggle).toBeChecked(); await page.getByLabel(th.vision.key).fill(KEY)
  await page.reload(); await expect(page.getByLabel(th.vision.key)).toHaveValue(KEY)
  await expect(toggle).toBeChecked(); await page.getByRole('button', { name: th.vision.remove }).click()
  await expect(toggle).not.toBeChecked(); await expect(page.getByLabel(th.vision.key)).toHaveValue('')
  expect(await page.evaluate(() => localStorage.getItem('jodsa:vision:key'))).toBeNull()
})

for (const status of [200,403]) test(`M12 upload Vision ${status} and no key on app requests`, async ({ page }) => {
  test.setTimeout(240000)
  const leaked: string[] = []; const pending: Promise<void>[] = []; let visionCalls = 0
  page.on('request', request => { if (new URL(request.url()).origin === 'http://localhost:3100') pending.push((async () => { if ((request.url() + JSON.stringify(await request.allHeaders()) + (request.postData() ?? '')).includes(KEY)) leaked.push(request.url()) })()) })
  await page.route('https://vision.googleapis.com/**', async route => {
    visionCalls++; expect(route.request().headers()['x-goog-api-key']).toBe(KEY)
    await route.fulfill({ status, contentType: 'application/json', body: status === 200 ? JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'Amount 432.10 THB' } }] }) : '{}' })
  })
  await page.goto('/settings'); await page.evaluate(key => { localStorage.setItem('jodsa:vision:key',key); localStorage.setItem('jodsa:vision:enabled','true'); localStorage.setItem('jodsa:vision:ack','true') }, KEY)
  // Exercise a real server action while the key is stored.
  await page.getByRole('button', { name: th.settings.notificationSave }).click()
  await page.goto('/import'); await page.locator('input[type="file"]').first().setInputFiles(path.join(GENERATED_DIR,'slip-noqr.png'))
  await expect(page.locator('#slip-amount')).toHaveValue(status === 200 ? '432.10' : '777.25', { timeout: 180000 })
  expect(visionCalls).toBe(1); await Promise.all(pending); expect(leaked).toEqual([])
})

test('M12 guest collect OCR never calls Vision even with a browser key', async ({ browser }) => {
  test.setTimeout(240000)
  const user = await findUserByEmail(env.userA.email); if (!user) throw new Error('Missing user A')
  const db = await testUserClient(user.id); const token = `m12-${Date.now()}-guest`
  const { data: account, error } = await db.from('accounts').insert({ user_id: user.id, name: 'M12 guest', bank: 'SCB' }).select('id').single(); if (error) throw error
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } }); const guest = await context.newPage(); let calls = 0
  await guest.route('https://vision.googleapis.com/**', route => { calls++; return route.abort() })
  await guest.addInitScript(key => { localStorage.setItem('jodsa:vision:key',key); localStorage.setItem('jodsa:vision:enabled','true'); localStorage.setItem('jodsa:vision:ack','true') }, KEY)
  try {
    const { error: sessionError } = await db.from('payment_sessions').insert({ id: token, owner: user.id, type: 'collect', title: 'M12 guest', account_id: account.id }); if (sessionError) throw sessionError
    await guest.goto(`/pay/${token}`); await guest.locator('input[type="file"]').setInputFiles(path.join(GENERATED_DIR,'slip-noqr.png'))
    await expect(guest.locator('#guest-amount')).toHaveValue('777.25', { timeout: 180000 }); expect(calls).toBe(0)
  } finally { await guest.evaluate(() => localStorage.clear()); await context.close(); await db.from('payment_sessions').delete().eq('id', token); await db.from('accounts').delete().eq('id', account.id) }
})
