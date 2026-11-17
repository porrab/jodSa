import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js'
import { findUserByEmail, testUserClient } from './helpers/admin'
import { env } from './helpers/env'

// Run only AFTER owner-authorized 0015. No service-role calls or global resets.
// Do not filter received payloads client-side: even a foreign PK-only DELETE fails.
test.describe.configure({ mode: 'serial' })
type Event = RealtimePostgresChangesPayload<Record<string, unknown>>
for (const table of ['accounts','transactions','budgets'] as const) {
  test(`M13 websocket isolation: ${table} INSERT UPDATE DELETE`, async () => {
    test.setTimeout(120000)
    const a = await findUserByEmail(env.userA.email), b = await findUserByEmail(env.userB.email)
    if (!a || !b) throw new Error('Missing test users A/B')
    const A = await testUserClient(a.id), B = await testUserClient(b.id)
    const receivedA: Event[] = [], receivedB: Event[] = []
    const aId = randomUUID(), bId = randomUUID()
    const accounts = { a: randomUUID(), b: randomUUID() }
    const channels: { db: SupabaseClient; channel: ReturnType<SupabaseClient['channel']> }[] = []
    async function subscribe(db: SupabaseClient, uid: string, received: Event[]) {
      const session = await db.auth.getSession()
      if (!session.data.session) throw new Error('Session missing')
      await db.realtime.setAuth(session.data.session.access_token)
      const channel = db.channel(`m13-${table}-${randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` }, payload => received.push(payload))
      channels.push({ db, channel })
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 15000)
        channel.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve() } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`Realtime ${status}`)) } })
      })
    }
    const foreign = () => receivedA.filter(p => p.new && 'id' in p.new && p.new.id === bId || p.old && 'id' in p.old && p.old.id === bId)
    function assertNoLeak() { if (foreign().length) throw new Error(`CROSS_USER_REALTIME_EVENT ${JSON.stringify(foreign())}`) }
    async function ownEvent(events: Event[], id: string, event: string) {
      await expect.poll(() => { assertNoLeak(); return events.some(p => p.eventType === event && ((p.new && 'id' in p.new && p.new.id === id) || (p.old && 'id' in p.old && p.old.id === id))) }, { timeout: 10000 }).toBe(true)
    }
    async function insert(db: SupabaseClient, uid: string, id: string, account: string) {
      const result = table === 'accounts' ? await db.from('accounts').insert({ id, user_id: uid, name: 'M13 isolated', bank: 'SCB' })
        : table === 'budgets' ? await db.from('budgets').insert({ id, user_id: uid, period: 'month', scope: 'category', category: `M13-${id}`, amount_satang: 10000 })
        : await db.from('transactions').insert({ id, user_id: uid, account_id: account, type: 'expense', amount_satang: 100, datetime: new Date().toISOString(), note: 'M13 isolation' })
      expect(result.error).toBeNull()
    }
    try {
      if (table === 'transactions') {
        expect((await A.from('accounts').insert({ id: accounts.a, user_id: a.id, name: 'M13 A source', bank: 'SCB' })).error).toBeNull()
        expect((await B.from('accounts').insert({ id: accounts.b, user_id: b.id, name: 'M13 B source', bank: 'SCB' })).error).toBeNull()
      }
      await subscribe(A, a.id, receivedA); await subscribe(B, b.id, receivedB)
      for (const event of ['INSERT','UPDATE','DELETE']) {
        if (event === 'INSERT') { await insert(A,a.id,aId,accounts.a); await insert(B,b.id,bId,accounts.b) }
        else {
          for (const [db,id] of [[A,aId],[B,bId]] as const) {
            const result = event === 'DELETE' ? await db.from(table).delete().eq('id', id) : await db.from(table).update(table === 'accounts' ? { name: 'M13 updated' } : { amount_satang: 20000 }).eq('id', id)
            expect(result.error).toBeNull()
          }
        }
        // Require positive controls on BOTH real sockets; publication disabled cannot pass.
        await ownEvent(receivedA, aId, event); await ownEvent(receivedB, bId, event)
        const until = Date.now() + 5000
        while (Date.now() < until) { assertNoLeak(); await new Promise(resolve => setTimeout(resolve, 100)) }
        assertNoLeak()
      }
    } finally {
      await Promise.all(channels.map(({ db, channel }) => db.removeChannel(channel)))
      expect((await A.from(table).delete().eq('id',aId)).error).toBeNull()
      expect((await B.from(table).delete().eq('id',bId)).error).toBeNull()
      if (table === 'transactions') {
        expect((await A.from('accounts').delete().eq('id',accounts.a)).error).toBeNull()
        expect((await B.from('accounts').delete().eq('id',accounts.b)).error).toBeNull()
      }
    }
  })
}
