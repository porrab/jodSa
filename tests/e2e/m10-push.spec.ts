import { test, expect } from '@playwright/test'
import { findUserByEmail, testUserClient, seedAccount, resetAllUserData } from './helpers/admin'
import { env, STORAGE_A } from './helpers/env'
import th from '../../messages/th.json'
let cleanup: (() => Promise<void>) | undefined
test.afterEach(async () => { await cleanup?.(); cleanup = undefined })
test.use({ storageState: STORAGE_A })
test('M10 cron requires a secret', async ({ request }) => { expect((await request.get('/api/cron/notify')).status()).toBe(401) })
test('M10 subscriptions/settings isolation and idempotent confirm/skip', async ({ page }) => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error('Missing test user A')
  const A = await testUserClient(a.id)
  const endpoint = `https://example.test/m10-${Date.now()}`
  let ruleId = ''
  cleanup = async () => {
    expect((await A.from('user_settings').upsert({ user_id: a.id, notification_prefs: { daily: true, recurring: true, quietStart: null, quietEnd: null } })).error).toBeNull()
    expect((await A.from('push_subscriptions').delete().eq('endpoint', endpoint)).error).toBeNull()
    if (ruleId) expect((await A.from('recurring_rules').delete().eq('id', ruleId)).error).toBeNull()
    await resetAllUserData(a.id)
  }
    await resetAllUserData(a.id)
    const account = await seedAccount(a.id, 'M10 account', 'SCB')
    const claim = await A.rpc('claim_push_subscription', { p_endpoint: endpoint, p_p256dh: 'test-key', p_auth: 'test-auth' }); expect(claim.error).toBeNull()
    expect((await A.from('user_settings').upsert({ user_id: a.id, notification_prefs: { daily: true, recurring: true, quietStart: null, quietEnd: null } })).error).toBeNull()
    const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0,10)
    const rule = await A.from('recurring_rules').insert({ user_id: a.id, account_id: account, type: 'expense', amount_satang: 12345, category: 'M10 payment', freq: 'monthly', interval: 1, start_date: date }).select('id').single()
    expect(rule.error).toBeNull(); ruleId = rule.data!.id
    const url = `/recurring/confirm?rule=${ruleId}&date=${date}`
    await page.goto(url)
    const before = await A.from('transactions').select('*').eq('recurring_rule_id', ruleId)
    expect(before.data).toHaveLength(1)
    await page.getByRole('button', { name: 'ยืนยันการจ่าย', exact: true }).click()
    await expect(page).toHaveURL(/\/recurring\?done=confirmed$/)
    await expect(page.getByRole('status')).toHaveText(th.settings.paymentConfirmed)
    expect((await A.from('transactions').select('*').eq('recurring_rule_id', ruleId)).data).toEqual(before.data)
    await page.goto(url); await page.getByRole('button', { name: 'ข้ามรายการนี้', exact: true }).click()
    await expect(page).toHaveURL(/\/recurring\?done=skipped$/)
    await expect(page.getByRole('status')).toHaveText(th.settings.paymentSkipped)
    await expect.poll(async () => (await A.from('transactions').select('*').eq('recurring_rule_id', ruleId)).data?.length).toBe(0)
    await page.goto(url)
    await expect(page.getByRole('status')).toHaveText(th.settings.alreadySkipped)
    expect((await A.from('recurring_exceptions').select('*').eq('rule_id', ruleId)).data).toHaveLength(1)
    expect((await A.from('transactions').select('*').eq('recurring_rule_id', ruleId)).data).toEqual([])
})
