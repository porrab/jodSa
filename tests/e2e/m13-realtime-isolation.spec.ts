import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { findUserByEmail, testUserClient } from './helpers/admin'
import { env } from './helpers/env'

// Owner gate: run ONLY after 0016 is applied, with --no-deps. No admin reads.
// Callbacks retain raw messages; validation happens in assertions, never delivery filters.
test.describe.configure({ mode: 'serial' })
type Raw = { event: string; payload: Record<string, unknown>; [key: string]: unknown }
for (const table of ['accounts','transactions','budgets'] as const) {
  test(`M13 private Broadcast isolation and injection denial: ${table}`, async () => {
    test.setTimeout(180000)
    const a = await findUserByEmail(env.userA.email), b = await findUserByEmail(env.userB.email)
    if (!a || !b) throw new Error('Missing A/B')
    const A = await testUserClient(a.id), B = await testUserClient(b.id)
    const receivedA: Raw[] = [], receivedB: Raw[] = [], unauthorized: Raw[] = []
    const channels: { db: SupabaseClient; channel: RealtimeChannel }[] = []
    const rows: { db: SupabaseClient; table: string; id: string }[] = []
    const aId = randomUUID(), bId = randomUUID(), sourceA = randomUUID(), sourceB = randomUUID()
    const deniedStatuses: string[] = []
    async function channel(db: SupabaseClient, uid: string, received: Raw[], denied = false) {
      const { data: { session } } = await db.auth.getSession(); if (!session) throw new Error('No session')
      await db.realtime.setAuth(session.access_token)
      const ch = db.channel(`user:${uid}`, { config: { private: true, broadcast: { ack: true } } }).on('broadcast', { event: '*' }, raw => received.push(raw as unknown as Raw))
      channels.push({ db, channel: ch })
      await new Promise<void>((resolve,reject) => {
        const timer = setTimeout(() => reject(new Error('Subscribe timeout')),15000)
        ch.subscribe(status => {
          if (denied) deniedStatuses.push(status)
          if (status === 'SUBSCRIBED' || (denied && ['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))) { clearTimeout(timer); resolve() }
          else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) { clearTimeout(timer); reject(new Error(status)) }
        })
      })
      return ch
    }
    function validate() {
      for (const [label, events, otherDb] of [['A',receivedA,B],['B',receivedB,A]] as const) {
        for (const raw of events) {
          expect(Object.keys(raw.payload).sort(), `${label}: ${JSON.stringify(raw)}`).toEqual(['id','op','table'])
          const foreignIds = rows.filter(row => row.db === otherDb).map(row => row.id)
          expect(foreignIds, `CROSS_USER_BROADCAST ${label}: ${JSON.stringify(raw)}`).not.toContain(raw.payload.id)
          expect(raw.event).toBe(raw.payload.op)
        }
      }
      expect(unauthorized, `UNAUTHORIZED_TOPIC_PAYLOAD ${JSON.stringify(unauthorized)}`).toEqual([])
    }
    async function seen(events: Raw[], id: string, op: string) {
      await expect.poll(() => { validate(); return events.some(e => e.payload.id === id && e.payload.op === op && e.payload.table === table) }, { timeout: 15000 }).toBe(true)
    }
    async function insert(db: SupabaseClient, uid: string, id: string, account: string) {
      rows.push({db,table,id})
      const result = table === 'accounts' ? await db.from(table).insert({ id,user_id:uid,name:'M13 broadcast',bank:'SCB' })
        : table === 'budgets' ? await db.from(table).insert({ id,user_id:uid,period:'month',scope:'category',category:`M13-${id}`,amount_satang:10000 })
        : await db.from(table).insert({ id,user_id:uid,account_id:account,type:'expense',amount_satang:100,datetime:new Date().toISOString() })
      expect(result.error).toBeNull()
    }
    async function observeWindow() {
      const until = Date.now()+5000
      while (Date.now()<until) { validate(); await new Promise(resolve => setTimeout(resolve,100)) }
      validate()
    }
    try {
      if (table === 'transactions') for (const [db,uid,id] of [[A,a.id,sourceA],[B,b.id,sourceB]] as const) {
        rows.push({db,table:'accounts',id}); expect((await db.from('accounts').insert({id,user_id:uid,name:'M13 source',bank:'SCB'})).error).toBeNull()
      }
      await channel(A,a.id,receivedA); await channel(B,b.id,receivedB)
      // Warm both sockets using observable writes. Retry ONLY throwaway probes until
      // an event is seen; measured inserts below are issued exactly once.
      for (const [db,uid,events,source] of [[A,a.id,receivedA,sourceA],[B,b.id,receivedB,sourceB]] as const) {
        const probes: string[] = []
        await expect.poll(async () => {
          validate()
          if (events.some(e => probes.includes(String(e.payload.id)))) return true
          const probe = randomUUID(); probes.push(probe); await insert(db,uid,probe,source)
          return events.some(e => probes.includes(String(e.payload.id)))
        }, { timeout: 20000, intervals: [200,500,1000] }).toBe(true)
        for (const id of probes) { expect((await db.from(table).delete().eq('id',id)).error).toBeNull(); await seen(events,id,'DELETE') }
      }
      const hostile = await channel(A,b.id,unauthorized,true)
      // Even if join is denied, send() may try HTTP fallback: both transports must deny injection.
      const marker = randomUUID()
      await hostile.send({ type:'broadcast',event:'INJECT',payload:{table,op:'INJECT',id:marker} }).catch(() => 'error')
      await observeWindow()
      expect(receivedB.some(e => e.event==='INJECT' || e.payload.id===marker)).toBe(false)
      for (const op of ['INSERT','UPDATE','DELETE']) {
        if (op==='INSERT') { await insert(A,a.id,aId,sourceA); await insert(B,b.id,bId,sourceB) }
        else for (const [db,id] of [[A,aId],[B,bId]] as const) {
          const result = op==='DELETE' ? await db.from(table).delete().eq('id',id) : await db.from(table).update(table==='accounts'?{name:'M13 edited'}:{amount_satang:200}).eq('id',id)
          expect(result.error).toBeNull()
        }
        await seen(receivedA,aId,op); await seen(receivedB,bId,op); await observeWindow()
      }
      await test.info().attach('broadcast-observations', { body:JSON.stringify({receivedA,receivedB,unauthorized,deniedStatuses},null,2),contentType:'application/json' })
    } finally {
      await Promise.all(channels.map(({db,channel})=>db.removeChannel(channel)))
      // Reverse order removes transactions before their source accounts.
      const errors: string[] = []
      for (const row of rows.reverse()) { const {error} = await row.db.from(row.table).delete().eq('id',row.id); if(error) errors.push(error.message) }
      expect(errors).toEqual([])
    }
  })
}
