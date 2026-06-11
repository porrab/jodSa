import fs from 'node:fs'
import path from 'node:path'
import { test as setup } from '@playwright/test'
import { env, AUTH_DIR, GENERATED_DIR, STORAGE_A, STORAGE_B } from './helpers/env'
import { ensureConfirmedUser } from './helpers/admin'
import { login } from './helpers/ui'
import { renderSlip } from './helpers/slips'

/**
 * Run-wide preparation:
 * 1. the two canonical test users from .env.test exist and are email-confirmed
 * 2. logged-in storage states for both (captured through the real login UI)
 * 3. the three synthetic slip fixtures, with run-unique QR refs
 */
setup('provision users, auth states, slip fixtures', async ({ browser }) => {
  setup.setTimeout(180_000)
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  fs.mkdirSync(GENERATED_DIR, { recursive: true })

  await ensureConfirmedUser(env.userA.email, env.userA.password, 'QA User A')
  await ensureConfirmedUser(env.userB.email, env.userB.password, 'QA User B')

  for (const [user, file] of [
    [env.userA, STORAGE_A],
    [env.userB, STORAGE_B],
  ] as const) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await login(page, user.email, user.password)
    await ctx.storageState({ path: file })
    await ctx.close()
  }

  const runId = Date.now().toString().slice(-9) // unique QR refs per run
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await renderSlip(page, path.join(GENERATED_DIR, 'slip-qr-a.png'), {
    bank: 'SCB', datetime: '15/05/2025 14:30', amount: '1250.00',
    toName: 'SOMCHAI JAIDEE', ref: `QA${runId}A`,
  })
  await renderSlip(page, path.join(GENERATED_DIR, 'slip-qr-b.png'), {
    bank: 'SCB', datetime: '16/05/2025 09:15', amount: '2340.50',
    toName: 'MALEE RAKDEE', ref: `QA${runId}B`,
  })
  await renderSlip(page, path.join(GENERATED_DIR, 'slip-noqr.png'), {
    bank: 'KBank', datetime: '15/05/2025 18:45', amount: '777.25',
    toName: 'PREEDA THONGDEE',
  })
  await ctx.close()
})
