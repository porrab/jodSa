/**
 * RLS isolation test — requires a running Supabase instance with two test users.
 * Create a .env.test (gitignored) with:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
 *   TEST_USER_A_EMAIL, TEST_USER_A_PASS,
 *   TEST_USER_B_EMAIL, TEST_USER_B_PASS
 *
 * Run: dotenv -e .env.test -- pnpm test tests/unit/rls.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

const SUPABASE_URL = process.env.TEST_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY
const USER_A_EMAIL = process.env.TEST_USER_A_EMAIL
const USER_A_PASS = process.env.TEST_USER_A_PASS
const USER_B_EMAIL = process.env.TEST_USER_B_EMAIL
const USER_B_PASS = process.env.TEST_USER_B_PASS

const SKIP = !SUPABASE_URL || !SUPABASE_ANON_KEY || !USER_A_EMAIL || !USER_B_EMAIL

describe.skipIf(SKIP)('RLS isolation: user B cannot read user A data', () => {
  let clientA: ReturnType<typeof createClient<Database>>
  let clientB: ReturnType<typeof createClient<Database>>
  let userAId: string
  let accountAId: string
  let txAId: string

  beforeAll(async () => {
    clientA = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
    clientB = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)

    const [resA, resB] = await Promise.all([
      clientA.auth.signInWithPassword({ email: USER_A_EMAIL!, password: USER_A_PASS! }),
      clientB.auth.signInWithPassword({ email: USER_B_EMAIL!, password: USER_B_PASS! }),
    ])
    if (resA.error) throw new Error(`User A login failed: ${resA.error.message}`)
    if (resB.error) throw new Error(`User B login failed: ${resB.error.message}`)

    userAId = resA.data.user!.id

    // User A creates an account — user_id must be auth.uid(), not empty
    const { data: acct, error: acctErr } = await clientA
      .from('accounts')
      .insert({ user_id: userAId, name: 'RLS Test Account', bank: 'SCB' })
      .select('id')
      .single()
    if (acctErr) throw new Error(`Account insert failed: ${acctErr.message}`)
    accountAId = acct!.id

    // User A creates a transaction
    const { data: tx, error: txErr } = await clientA
      .from('transactions')
      .insert({
        user_id: userAId,
        type: 'income',
        amount_satang: 10000,
        account_id: accountAId,
        datetime: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (txErr) throw new Error(`Transaction insert failed: ${txErr.message}`)
    txAId = tx!.id
  })

  afterAll(async () => {
    if (txAId) await clientA.from('transactions').delete().eq('id', txAId)
    if (accountAId) await clientA.from('accounts').delete().eq('id', accountAId)
    await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()])
  })

  it('B cannot see A\'s accounts', async () => {
    const { data, error } = await clientB.from('accounts').select('id')
    expect(error).toBeNull()
    const found = (data ?? []).find((a) => a.id === accountAId)
    expect(found).toBeUndefined()
  })

  it('B cannot see A\'s transactions', async () => {
    const { data, error } = await clientB.from('transactions').select('id')
    expect(error).toBeNull()
    const found = (data ?? []).find((t) => t.id === txAId)
    expect(found).toBeUndefined()
  })

  // account_balances() is SECURITY INVOKER — RLS on accounts + transactions
  // applies inside the function, so it must behave exactly like direct selects.
  it('account_balances RPC computes A\'s balance under A\'s session', async () => {
    const { data, error } = await clientA.rpc('account_balances')
    expect(error).toBeNull()
    const row = (data ?? []).find((r) => r.account_id === accountAId)
    // opening balance 0 + the single 10000-satang income inserted above
    expect(row?.balance_satang).toBe(10000)
  })

  it('account_balances RPC does not leak A\'s accounts to B', async () => {
    const { data, error } = await clientB.rpc('account_balances')
    expect(error).toBeNull()
    expect((data ?? []).find((r) => r.account_id === accountAId)).toBeUndefined()
  })

  it('account_balances RPC returns nothing for anon', async () => {
    const anon = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
    const { data, error } = await anon.rpc('account_balances')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })
})

describe.skipIf(SKIP)('M4 RLS: guest capability-token (Pattern B)', () => {
  let host: ReturnType<typeof createClient<Database>>
  let guest: ReturnType<typeof createClient<Database>>
  let other: ReturnType<typeof createClient<Database>>
  let hostId: string
  let accountId: string
  const openToken = `rls-test-open-${Date.now()}`
  const closedToken = `rls-test-closed-${Date.now()}`

  beforeAll(async () => {
    host = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
    // guest + other are bare anon clients — never signed in
    guest = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
    other = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)

    const res = await host.auth.signInWithPassword({
      email: USER_A_EMAIL!,
      password: USER_A_PASS!,
    })
    if (res.error) throw new Error(`Host login failed: ${res.error.message}`)
    hostId = res.data.user!.id

    const { data: acct, error: acctErr } = await host
      .from('accounts')
      .insert({ user_id: hostId, name: 'M4 RLS Account', bank: 'SCB' })
      .select('id')
      .single()
    if (acctErr) throw new Error(`Account insert failed: ${acctErr.message}`)
    accountId = acct!.id

    const { error: sessErr } = await host.from('payment_sessions').insert([
      // status must be explicit: PostgREST bulk inserts null-fill keys missing
      // from one row when another row provides them (DEFAULT is not applied).
      { id: openToken, owner: hostId, account_id: accountId, title: 'Open session', status: 'open' },
      { id: closedToken, owner: hostId, account_id: accountId, title: 'Closed session', status: 'closed' },
    ])
    if (sessErr) throw new Error(`Session insert failed: ${sessErr.message}`)
  })

  afterAll(async () => {
    await host.from('payment_sessions').delete().in('id', [openToken, closedToken])
    await host.from('accounts').delete().eq('id', accountId)
    await host.auth.signOut()
  })

  it('anon can read an OPEN session by its token', async () => {
    const { data, error } = await guest
      .from('payment_sessions')
      .select('id, title')
      .eq('id', openToken)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data?.title).toBe('Open session')
  })

  it('anon cannot see a CLOSED session', async () => {
    const { data, error } = await guest
      .from('payment_sessions')
      .select('id')
      .eq('id', closedToken)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('anon can INSERT a slip into an OPEN session', async () => {
    const { error } = await guest.from('session_slips').insert({
      session_id: openToken,
      amount_satang: 12345,
      ref_code: `ref-${Date.now()}`,
      paid_at: new Date().toISOString(),
    })
    expect(error).toBeNull()
  })

  it('anon INSERT into a CLOSED session is rejected', async () => {
    const { error } = await guest.from('session_slips').insert({
      session_id: closedToken,
      amount_satang: 12345,
      paid_at: new Date().toISOString(),
    })
    expect(error).not.toBeNull()
  })

  it('anon cannot SELECT session_slips — not even its own insert', async () => {
    const { data, error } = await other
      .from('session_slips')
      .select('id')
      .eq('session_id', openToken)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('host (owner) sees the guest slip', async () => {
    const { data, error } = await host
      .from('session_slips')
      .select('id, amount_satang, confirmed')
      .eq('session_id', openToken)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].amount_satang).toBe(12345)
    expect(data![0].confirmed).toBe(false)
  })

  it('user B cannot read A\'s sessions or slips', async () => {
    const clientB = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
    const res = await clientB.auth.signInWithPassword({
      email: USER_B_EMAIL!,
      password: USER_B_PASS!,
    })
    if (res.error) throw new Error(`User B login failed: ${res.error.message}`)

    // anon_read policy is `to anon` only — authenticated B matches just
    // owner_all, which excludes non-owners.
    const { data: sessions } = await clientB
      .from('payment_sessions')
      .select('id')
      .in('id', [openToken, closedToken])
    expect(sessions ?? []).toHaveLength(0)

    const { data: slips } = await clientB
      .from('session_slips')
      .select('id')
      .eq('session_id', openToken)
    expect(slips ?? []).toHaveLength(0)

    await clientB.auth.signOut()
  })
})
