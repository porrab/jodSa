import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const state = vi.hoisted(() => ({ send: vi.fn(), deleted: [] as string[] }))
vi.mock('web-push', () => ({ setVapidDetails: vi.fn(), sendNotification: state.send }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
  from: () => {
    let deleting = false
    const query = {
      select: () => query, eq: (field: string, value: string) => { if (deleting && field === 'id') state.deleted.push(value); return query }, order: () => query,
      range: async () => ({ data: [{ id: 'device-id', user_id: 'test-user', endpoint: 'https://push.example/private-device', p256dh: 'private-key', auth: 'private-auth' }], error: null }),
      delete: () => { deleting = true; return query },
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
    }
    return query
  },
}) }))
import { sendTestNotification } from '@/app/actions/notifications'
beforeEach(() => { state.send.mockReset(); state.deleted = [] })
it('returns successful per-device status without endpoints', async () => {
  state.send.mockResolvedValue({ statusCode: 201, body: '' })
  expect(await sendTestNotification()).toEqual([{ ok: true, statusCode: 201, body: '' }])
})
it.each([403,410])('returns sanitized %s diagnostics and cleans expired devices', async statusCode => {
  state.send.mockRejectedValue({ statusCode, body: 'https://push.example/private-device private-key private-auth test-user ' + 'x'.repeat(250) })
  const result = await sendTestNotification()
  expect(result[0]).toMatchObject({ ok: false, statusCode })
  expect(result[0].body.length).toBeLessThanOrEqual(200)
  expect(JSON.stringify(result)).not.toMatch(/private-device|private-key|private-auth|test-user/)
  expect(state.deleted).toEqual(statusCode === 410 ? ['device-id'] : [])
})
