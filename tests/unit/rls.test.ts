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
})
