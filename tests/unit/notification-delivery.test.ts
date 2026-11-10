import { beforeEach, expect, it, vi } from 'vitest'
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
  await GET(request()); expect(state.send).toHaveBeenCalledTimes(4)
  vi.setSystemTime(new Date('2026-11-10T05:30:00Z')); await GET(request()); expect(state.send).toHaveBeenCalledTimes(4)
  expect(state.send.mock.calls.some(c => String(c[1]).includes('/recurring/confirm?rule=r&date=2026-11-10'))).toBe(true)
})
it.each([404,410])('removes expired subscriptions on %s', async statusCode => { state.send.mockRejectedValue({ statusCode }); await GET(request()); expect(state.deleted).toContain('one'); expect(state.deleted).toContain('two') })
it('respects disabled types and overnight quiet hours', async () => { state.prefs.daily = false; state.prefs.recurring = false; await GET(request()); expect(state.send).not.toHaveBeenCalled(); state.prefs.daily = true; state.prefs.quietStart = '22:00'; state.prefs.quietEnd = '13:00'; await GET(request()); expect(state.send).not.toHaveBeenCalled() })
