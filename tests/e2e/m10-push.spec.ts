import { test, expect } from '@playwright/test'
import { findUserByEmail, testUserClient, seedAccount, resetAllUserData } from './helpers/admin'
import { env, STORAGE_A } from './helpers/env'
test.use({ storageState: STORAGE_A })
test('M10 cron requires a secret', async ({ request }) => { expect((await request.get('/api/cron/notify')).status()).toBe(401) })
test('M10 subscriptions/settings isolation and idempotent confirm/skip', async ({ page }) => {
  const a = await findUserByEmail(env.userA.email), b = await findUserByEmail(env.userB.email)
  if (!a || !b) throw new Error('Missing test users')
  const A = await testUserClient(a.id), B = await testUserClient(b.id)
  const endpoint = `https://example.test/m10-${Date.now()}`
  let ruleId = ''
  try {
    await resetAllUserData(a.id)
    const account = await seedAccount(a.id, 'M10 account', 'SCB')
    const claim = await A.rpc('claim_push_subscription', { p_endpoint: endpoint, p_p256dh: 'test-key', p_auth: 'test-auth' }); expect(claim.error).toBeNull()
    expect((await A.from('user_settings').upsert({ user_id: a.id, notification_prefs: { daily: true } })).error).toBeNull()
    expect((await B.from('push_subscriptions').select('*').eq('user_id', a.id)).data).toEqual([])
    expect((await B.from('user_settings').select('*').eq('user_id', a.id)).data).toEqual([])
    const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0,10)
    const rule = await A.from('recurring_rules').insert({ user_id: a.id, account_id: account, type: 'expense', amount_satang: 12345, category: 'M10 payment', freq: 'monthly', interval: 1, start_date: date }).select('id').single()
    expect(rule.error).toBeNull(); ruleId = rule.data!.id
    const url = `/recurring/confirm?rule=${ruleId}&date=${date}`
    await page.goto(url)
    const before = await A.from('transactions').select('*').eq('recurring_rule_id', ruleId)
    expect(before.data).toHaveLength(1)
    await page.getByRole('button', { name: 'ยืนยันการจ่าย', exact: true }).click()
    expect((await A.from('transactions').select('*').eq('recurring_rule_id', ruleId)).data).toEqual(before.data)
    await page.goto(url); await page.getByRole('button', { name: 'ข้ามรายการนี้', exact: true }).click()
    await expect.poll(async () => (await A.from('transactions').select('*').eq('recurring_rule_id', ruleId)).data?.length).toBe(0)
    await page.goto(url); await page.getByRole('button', { name: 'ข้ามรายการนี้', exact: true }).click()
    expect((await A.from('recurring_exceptions').select('*').eq('rule_id', ruleId)).data).toHaveLength(1)
    expect((await A.from('transactions').select('*').eq('recurring_rule_id', ruleId)).data).toEqual([])
  } finally {
    await A.from('push_subscriptions').delete().eq('endpoint', endpoint)
    await A.from('user_settings').upsert({ user_id: a.id, notification_prefs: { daily: true, recurring: true, quietStart: null, quietEnd: null } })
    if (ruleId) await A.from('recurring_rules').delete().eq('id', ruleId)
    await resetAllUserData(a.id)
  }
})
