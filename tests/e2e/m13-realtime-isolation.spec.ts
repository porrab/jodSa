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
    const receivedA: Event[] = [], receivedB: Event[] = [], receivedAUnfiltered: Event[] = []
    const aId = randomUUID(), bId = randomUUID()
    const accounts = { a: randomUUID(), b: randomUUID() }
    const channels: { db: SupabaseClient; channel: ReturnType<SupabaseClient['channel']> }[] = []
    async function subscribe(db: SupabaseClient, uid: string, received: Event[], filtered = true) {
      const session = await db.auth.getSession()
      if (!session.data.session) throw new Error('Session missing')
      await db.realtime.setAuth(session.data.session.access_token)
      const channel = db.channel(`m13-${table}-${randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table, ...(filtered ? { filter: `user_id=eq.${uid}` } : {}) }, payload => received.push(payload))
      channels.push({ db, channel })
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 15000)
        channel.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve() } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`Realtime ${status}`)) } })
      })
    }
    const hasId = (p: Event, id: string) => (p.new && 'id' in p.new && p.new.id === id) || (p.old && 'id' in p.old && p.old.id === id)
    function assertNoLeak() {
      for (const [subscriber, events] of [['A filtered', receivedA], ['A unfiltered', receivedAUnfiltered]] as const) {
        const foreign = events.filter(p => hasId(p, bId))
        if (foreign.length) throw new Error(`CROSS_USER_REALTIME_EVENT ${subscriber} ${JSON.stringify(foreign)}`)
      }
    }
    async function ownEvent(events: Event[], id: string, event: string, subscriber: string) {
      try {
        await expect.poll(() => { assertNoLeak(); return events.some(p => p.eventType === event && hasId(p, id)) }, { timeout: 10000, message: `${table}: ${subscriber} must receive its own ${event}` }).toBe(true)
      } catch (error) {
        assertNoLeak()
        if (event === 'DELETE') {
          // Observation is diagnostic only: missing filtered DELETE remains a FAILURE.
          const observed = { table, subscriber, ownFiltered: events.filter(p => hasId(p, id)), aUnfiltered: receivedAUnfiltered.filter(p => hasId(p, aId)) }
          await test.info().attach('delete-delivery-observation', { body: JSON.stringify(observed, null, 2), contentType: 'application/json' })
          throw new Error(`DELETE_DELIVERY_NOT_OBSERVED ${subscriber}; default replica identity may omit user_id. ${JSON.stringify(observed)}`, { cause: error })
        }
        throw error
      }
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
      await subscribe(A, a.id, receivedAUnfiltered, false)
      for (const event of ['INSERT','UPDATE','DELETE']) {
        if (event === 'INSERT') { await insert(A,a.id,aId,accounts.a); await insert(B,b.id,bId,accounts.b) }
        else {
          for (const [db,id] of [[A,aId],[B,bId]] as const) {
            const result = event === 'DELETE' ? await db.from(table).delete().eq('id', id) : await db.from(table).update(table === 'accounts' ? { name: 'M13 updated' } : { amount_satang: 20000 }).eq('id', id)
            expect(result.error).toBeNull()
          }
        }
        // All raw subscriptions need positive controls; a dead unfiltered channel cannot pass.
        await ownEvent(receivedAUnfiltered, aId, event, 'A unfiltered')
        await ownEvent(receivedA, aId, event, 'A filtered')
        await ownEvent(receivedB, bId, event, 'B filtered')
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
