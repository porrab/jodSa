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

  // M7-A: updateTransaction relies on `transactions_update_own` RLS (using +
  // with check on user_id = auth.uid()) rather than an app-level ownership
  // filter. B's update must silently match zero rows — A's row must come back
  // unchanged under A's own session.
  it('B cannot update A\'s transaction (M7-A)', async () => {
    const { error: updateErr } = await clientB
      .from('transactions')
      .update({ amount_satang: 999999 })
      .eq('id', txAId)
    expect(updateErr).toBeNull() // RLS excludes the row — no error, just no match

    const { data, error } = await clientA
      .from('transactions')
      .select('amount_satang')
      .eq('id', txAId)
      .single()
    expect(error).toBeNull()
    expect(data?.amount_satang).toBe(10000) // unchanged from setup
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

// M8: slip_account_map — the learned fingerprint → account mapping (Smart
// Account Mapping). 2-user isolation test per the supabase-rls skill's review
// checklist ("2-user isolation test exists (user A cannot read user B's rows)").
describe.skipIf(SKIP)('M8 RLS: slip_account_map owner isolation', () => {
  let clientA: ReturnType<typeof createClient<Database>>
  let clientB: ReturnType<typeof createClient<Database>>
  let userAId: string
  let userBId: string
  let accountAId: string
  let mapAId: string
  const fingerprint = `rls-test-fp-${Date.now()}`

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
    userBId = resB.data.user!.id

    const { data: acct, error: acctErr } = await clientA
      .from('accounts')
      .insert({ user_id: userAId, name: 'M8 RLS Account', bank: 'KTB' })
      .select('id')
      .single()
    if (acctErr) throw new Error(`Account insert failed: ${acctErr.message}`)
    accountAId = acct!.id

    const { data: map, error: mapErr } = await clientA
      .from('slip_account_map')
      .insert({ user_id: userAId, fingerprint, account_id: accountAId })
      .select('id')
      .single()
    if (mapErr) throw new Error(`slip_account_map insert failed: ${mapErr.message}`)
    mapAId = map!.id
  })

  afterAll(async () => {
    if (mapAId) await clientA.from('slip_account_map').delete().eq('id', mapAId)
    if (accountAId) await clientA.from('accounts').delete().eq('id', accountAId)
    await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()])
  })

  it('A can read their own mapping', async () => {
    const { data, error } = await clientA
      .from('slip_account_map')
      .select('id, account_id, fingerprint')
      .eq('id', mapAId)
      .single()
    expect(error).toBeNull()
    expect(data?.account_id).toBe(accountAId)
  })

  it('B cannot see A\'s mapping', async () => {
    const { data, error } = await clientB.from('slip_account_map').select('id')
    expect(error).toBeNull()
    expect((data ?? []).find((m) => m.id === mapAId)).toBeUndefined()
  })

  it('B cannot insert a mapping row claiming to be A\'s user_id', async () => {
    const { error } = await clientB
      .from('slip_account_map')
      .insert({ user_id: userAId, fingerprint: `${fingerprint}-b`, account_id: accountAId })
    expect(error).not.toBeNull() // insert with-check requires user_id = auth.uid()
  })

  it('B cannot update A\'s mapping', async () => {
    const { error: updateErr } = await clientB
      .from('slip_account_map')
      .update({ hits: 999 })
      .eq('id', mapAId)
    expect(updateErr).toBeNull() // RLS excludes the row — no error, just no match

    const { data } = await clientA.from('slip_account_map').select('hits').eq('id', mapAId).single()
    expect(data?.hits).toBe(1) // unchanged from insert default
  })

  it('B can create their own mapping under the SAME fingerprint without conflicting with A\'s', async () => {
    const { data: acctB, error: acctErr } = await clientB
      .from('accounts')
      .insert({ user_id: userBId, name: 'M8 RLS Account B', bank: 'KTB' })
      .select('id')
      .single()
    expect(acctErr).toBeNull()

    const { data: mapB, error: mapErr } = await clientB
      .from('slip_account_map')
      .insert({ user_id: userBId, fingerprint, account_id: acctB!.id })
      .select('id')
      .single()
    expect(mapErr).toBeNull() // UNIQUE(user_id, fingerprint) is per-user, not global
    expect(mapB?.id).not.toBe(mapAId)

    await clientB.from('slip_account_map').delete().eq('id', mapB!.id)
    await clientB.from('accounts').delete().eq('id', acctB!.id)
  })
})

// SPEC-4 M1: holdings / asset_transactions / assets (custom rows) owner isolation
// + shared reference reads on system-seeded assets. Per M8's precedent, this suite
// errors with "relation does not exist" until db/migrations/0008_invest_holdings.sql
// is applied to the live Supabase project — expected until that owner sign-off step.
describe.skipIf(SKIP)('M1 (SPEC-4) RLS: invest holdings/asset_transactions/assets', () => {
  let clientA: ReturnType<typeof createClient<Database>>
  let clientB: ReturnType<typeof createClient<Database>>
  let userAId: string
  let systemAssetId: string
  let customAssetAId: string
  let holdingAId: string
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

    const { data: sysAsset, error: sysErr } = await clientA
      .from('assets')
      .select('id')
      .eq('is_system', true)
      .limit(1)
      .single()
    if (sysErr) throw new Error(`Fetching a seeded system asset failed: ${sysErr.message}`)
    systemAssetId = sysAsset!.id

    const { data: customAsset, error: caErr } = await clientA
      .from('assets')
      .insert({
        name: `RLS Test Asset ${Date.now()}`,
        asset_class: 'crypto',
        currency: 'USD',
        is_system: false,
        user_id: userAId,
      })
      .select('id')
      .single()
    if (caErr) throw new Error(`Custom asset insert failed: ${caErr.message}`)
    customAssetAId = customAsset!.id

    const { data: holding, error: hErr } = await clientA
      .from('holdings')
      .insert({ user_id: userAId, asset_id: systemAssetId, sleeve: 'core' })
      .select('id')
      .single()
    if (hErr) throw new Error(`Holding insert failed: ${hErr.message}`)
    holdingAId = holding!.id

    const { data: tx, error: txErr } = await clientA
      .from('asset_transactions')
      .insert({
        user_id: userAId,
        holding_id: holdingAId,
        type: 'buy',
        qty: '1',
        price_minor: '10000',
        currency: 'USD',
        fees_minor: '0',
        datetime: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (txErr) throw new Error(`asset_transactions insert failed: ${txErr.message}`)
    txAId = tx!.id
  })

  afterAll(async () => {
    if (txAId) await clientA.from('asset_transactions').delete().eq('id', txAId)
    if (holdingAId) await clientA.from('holdings').delete().eq('id', holdingAId)
    if (customAssetAId) await clientA.from('assets').delete().eq('id', customAssetAId)
    await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()])
  })

  it('B cannot see A\'s holdings', async () => {
    const { data, error } = await clientB.from('holdings').select('id')
    expect(error).toBeNull()
    expect((data ?? []).find((h) => h.id === holdingAId)).toBeUndefined()
  })

  it('B cannot see A\'s asset_transactions', async () => {
    const { data, error } = await clientB.from('asset_transactions').select('id')
    expect(error).toBeNull()
    expect((data ?? []).find((t) => t.id === txAId)).toBeUndefined()
  })

  it('B cannot see A\'s custom asset', async () => {
    const { data, error } = await clientB.from('assets').select('id').eq('id', customAssetAId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('both A and B can read the shared system-seeded asset', async () => {
    const [{ data: a }, { data: b }] = await Promise.all([
      clientA.from('assets').select('id').eq('id', systemAssetId).single(),
      clientB.from('assets').select('id').eq('id', systemAssetId).single(),
    ])
    expect(a?.id).toBe(systemAssetId)
    expect(b?.id).toBe(systemAssetId)
  })

  it('B cannot insert a holding claiming to be A\'s user_id', async () => {
    const { error } = await clientB
      .from('holdings')
      .insert({ user_id: userAId, asset_id: systemAssetId, sleeve: 'core' })
    expect(error).not.toBeNull()
  })

  it('B cannot update A\'s holding', async () => {
    const { error: updateErr } = await clientB
      .from('holdings')
      .update({ sleeve: 'risk_capital' })
      .eq('id', holdingAId)
    expect(updateErr).toBeNull() // RLS excludes the row — no error, just no match

    const { data } = await clientA.from('holdings').select('sleeve').eq('id', holdingAId).single()
    expect(data?.sleeve).toBe('core') // unchanged from setup
  })

  it('B cannot claim a row as system (is_system insert is restricted to false for owned rows)', async () => {
    const { error } = await clientB
      .from('assets')
      .insert({ name: 'Fake system asset', asset_class: 'gold', currency: 'THB', is_system: true })
    expect(error).not.toBeNull()
  })
})

// portfolio_snapshots' RLS policies were authored + applied in 0008 (M1), but
// M1's own review only exercised holdings/asset_transactions/assets — M3 is
// the first milestone to actually write/read this table through the app
// (savePortfolioSnapshot). Per this repo's quality bar ("2-user isolation
// test before merge"), prove it live here rather than trusting-by-pattern.
describe.skipIf(SKIP)('M3 RLS: portfolio_snapshots owner isolation', () => {
  let clientA: ReturnType<typeof createClient<Database>>
  let clientB: ReturnType<typeof createClient<Database>>
  let userAId: string
  let snapshotAId: string

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

    const { data: snapshot, error } = await clientA
      .from('portfolio_snapshots')
      .insert({
        user_id: userAId,
        display_currency: 'THB',
        holdings: [],
        totals: { valueMinor: '0', costMinor: '0', pnlMinor: '0', pricedCount: 0, unpricedCount: 0, excludedCount: 0, currency: 'THB' },
        allocation: { assetClass: [], currency: [], sleeve: [] },
      })
      .select('id')
      .single()
    if (error) throw new Error(`portfolio_snapshots insert failed: ${error.message}`)
    snapshotAId = snapshot!.id
  })

  afterAll(async () => {
    if (snapshotAId) await clientA.from('portfolio_snapshots').delete().eq('id', snapshotAId)
    await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()])
  })

  it('B cannot see A\'s snapshot', async () => {
    const { data, error } = await clientB.from('portfolio_snapshots').select('id')
    expect(error).toBeNull()
    expect((data ?? []).find((s) => s.id === snapshotAId)).toBeUndefined()
  })

  it('B cannot insert a snapshot claiming to be A\'s user_id', async () => {
    const { error } = await clientB.from('portfolio_snapshots').insert({
      user_id: userAId,
      display_currency: 'THB',
      holdings: [],
      totals: {},
      allocation: {},
    })
    expect(error).not.toBeNull()
  })

  it('B cannot update or delete A\'s snapshot', async () => {
    const { error: updateErr } = await clientB
      .from('portfolio_snapshots')
      .update({ display_currency: 'USD' })
      .eq('id', snapshotAId)
    expect(updateErr).toBeNull() // RLS excludes the row — no error, just no match

    const { data } = await clientA.from('portfolio_snapshots').select('display_currency').eq('id', snapshotAId).single()
    expect(data?.display_currency).toBe('THB') // unchanged

    const { error: deleteErr } = await clientB.from('portfolio_snapshots').delete().eq('id', snapshotAId)
    expect(deleteErr).toBeNull()
    const { data: stillThere } = await clientA.from('portfolio_snapshots').select('id').eq('id', snapshotAId).single()
    expect(stillThere?.id).toBe(snapshotAId)
  })

  it('A can read their own snapshot back', async () => {
    const { data, error } = await clientA.from('portfolio_snapshots').select('id').eq('id', snapshotAId).single()
    expect(error).toBeNull()
    expect(data?.id).toBe(snapshotAId)
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
