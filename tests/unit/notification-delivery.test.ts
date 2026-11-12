import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ claims: new Set<string>(), deleted: [] as string[], send: vi.fn(), prefs: { daily: true, recurring: true, quietStart: null as string | null, quietEnd: null as string | null } }))
vi.mock('web-push', () => ({ setVapidDetails: vi.fn(), sendNotification: state.send }))
vi.mock('@/app/api/cron/notify/supabase', () => ({ createCronClient: () => ({ from: (table: string) => {
  let operation = 'read'; let insert: Record<string, unknown> = {}; let id = ''
  const query = {
    select: () => query, order: () => query,
    range: async () => ({ error: null, data: table === 'push_subscriptions' ? ['one','two'].map(id => ({ id, user_id: 'a', endpoint: id, p256dh: 'key', auth: 'auth' })) : table === 'user_settings' ? [{ user_id: 'a', notification_prefs: state.prefs }] : table === 'users' ? [{ id: 'a', locale: 'en' }] : table === 'recurring_rules' ? [{ id: 'r', user_id: 'a', freq: 'weekly', interval: 1, by_weekday: [2], start_date: '2026-11-10', end_date: null }] : [] }),
    insert: (value: Record<string, unknown>) => { operation = 'insert'; insert = value; return query },
    single: async () => { const key = JSON.stringify(insert); if (state.claims.has(key)) return { error: { code: '23505' }, data: null }; state.claims.add(key); return { error: null, data: { id: key } } },
    delete: () => { operation = 'delete'; return query },
    eq: (_key: string, value: string) => { id = value; return query },
    then: (resolve: (value: { error: null }) => unknown) => { if (operation === 'delete') { state.deleted.push(id); state.claims.delete(id) }; return Promise.resolve(resolve({ error: null })) },
  }; return query
} }) }))
import { GET } from '@/app/api/cron/notify/route'
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T05:01:00Z')); process.env.CRON_SECRET = 'test'; state.claims.clear(); state.deleted = []; state.send.mockReset().mockResolvedValue({}); state.prefs = { daily: true, recurring: true, quietStart: null, quietEnd: null } })
const request = () => new Request('http://localhost/api/cron/notify', { headers: { authorization: 'Bearer test' } })
it('rejects missing and incorrect credentials', async () => { expect((await GET(new Request('http://localhost/api/cron/notify'))).status).toBe(401) })
it('claims daily and unmaterialized recurring once and fans out to both devices', async () => {
  const result = await (await GET(request())).json(); expect(result).toMatchObject({ users: 1, devices: 2, claimed: 2, sent: 4, failed: [] }); expect(state.send).toHaveBeenCalledTimes(4)
  vi.setSystemTime(new Date('2026-11-10T05:30:00Z'))
  const retry = await (await GET(request())).json()
  expect(retry.sent).toBe(0)
  expect(retry.skipped.alreadyClaimed).toBeGreaterThan(0)
  expect(state.send).toHaveBeenCalledTimes(4)
  expect(state.send.mock.calls.some(c => String(c[1]).includes('/recurring/confirm?rule=r&date=2026-11-10'))).toBe(true)
})
it('releases claims when every device fails and retries successfully in the same slot', async () => {
  state.send.mockRejectedValue({ statusCode: 403, body: 'Forbidden' })
  const failed = await (await GET(request())).json()
  expect(failed.sent).toBe(0)
  expect(failed.claimed).toBe(2)
  expect(state.send).toHaveBeenCalledTimes(4)
  expect(state.claims.size).toBe(0)
  state.send.mockResolvedValue({})
  vi.setSystemTime(new Date('2026-11-10T05:27:00Z'))
  const retry = await (await GET(request())).json()
  expect(retry).toMatchObject({ sent: 4, claimed: 2, skipped: { alreadyClaimed: 0 } })
  expect(state.send).toHaveBeenCalledTimes(8)
})
it.each([404,410])('removes expired subscriptions on %s', async statusCode => { state.send.mockRejectedValue({ statusCode }); await GET(request()); expect(state.deleted).toContain('one'); expect(state.deleted).toContain('two') })
it('reports 403 failures without leaking device details', async () => { state.send.mockRejectedValue({ statusCode: 403, body: 'one key auth ' + 'x'.repeat(250) }); const result = await (await GET(request())).json(); expect(result.failed).toHaveLength(4); expect(result.failed[0].statusCode).toBe(403); expect(result.failed[0].body.length).toBeLessThanOrEqual(200); expect(result.failed[0].body).not.toContain('one'); expect(result.sent).toBe(0) })
it('respects disabled types and overnight quiet hours', async () => { state.prefs.daily = false; state.prefs.recurring = false; expect((await (await GET(request())).json()).skipped).toMatchObject({ dailyOff: 1, recurringOff: 1 }); expect(state.send).not.toHaveBeenCalled(); state.prefs.daily = true; state.prefs.quietStart = '22:00'; state.prefs.quietEnd = '13:00'; expect((await (await GET(request())).json()).skipped.quiet).toBe(1); expect(state.send).not.toHaveBeenCalled() })
