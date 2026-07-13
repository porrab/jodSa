import { nanoid } from 'nanoid'
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './helpers/env'
import { adminClient, findUserByEmail, seedAccount } from './helpers/admin'
import { seedTripSession, type SeededTrip } from './helpers/trip'

/**
 * ANON-DENY — standing RLS-layer security scenario (pm-desk queued at M6-2).
 *
 * These checks bypass the app's API routes and hit PostgREST DIRECTLY as a bare
 * anon client (anon key, no user session) — the credential a hostile link-holder
 * actually holds. They lock the `session_slips` RLS contract at the DB layer, a
 * DIFFERENT layer than the API-route checks in m4-guest-pay / trip-6 (those return
 * app-level 403; these prove the underlying 42501 row-level-security deny).
 *
 * Contract under test:
 *   • session_slips has NO anon SELECT policy  → anon reads ZERO rows (0001).
 *   • session_slips_anon_insert_open (0005) `with check (status='open' AND
 *     type='collect')`:
 *       - OPEN TRIP session      → anon INSERT rejected (42501)   [migration 0005]
 *       - CLOSED COLLECT session → anon INSERT rejected (42501)
 *       - OPEN COLLECT session   → anon INSERT ALLOWED (positive control — proves
 *         the deny is scoped to type/status, NOT a blanket anon-insert ban; this
 *         is also M4's Pattern-B guest-pay path at the RLS layer).
 *
 * Self-contained: seeds its own dedicated sessions via the admin client and
 * deletes exactly those in afterAll — order-independent, no shared reset that
 * could bleed into another spec (heeds QA-M7-H1 / QA-M9-H1).
 */

test.describe.configure({ mode: 'serial' })

/** A different anon client: bare anon key, no user session. */
function anonClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** A with-check RLS violation surfaces as SQLSTATE 42501 via PostgREST. */
function expectRlsDenied(error: { code?: string; message?: string } | null, label: string) {
  expect(error, `${label}: anon INSERT must be denied by RLS (got no error)`).not.toBeNull()
  const denied = error?.code === '42501' || /row-level security/i.test(error?.message ?? '')
  expect(denied, `${label}: expected 42501 / row-level-security, got ${error?.code} "${error?.message}"`).toBe(true)
}

let accountId = ''
let openCollect = ''
let closedCollect = ''
let trip: SeededTrip

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  const admin = adminClient()

  // A collect session REQUIRES an account (payment_sessions_account_per_type).
  accountId = await seedAccount(a.id, 'QA-ANON-DENY', 'SCB')

  openCollect = nanoid(21)
  {
    const { error } = await admin.from('payment_sessions').insert({
      id: openCollect, owner: a.id, account_id: accountId, type: 'collect',
      title: 'QA-ANON open collect', status: 'open', target_amount_satang: null,
    })
    if (error) throw new Error(`seed open collect failed: ${error.message}`)
  }

  closedCollect = nanoid(21)
  {
    const { error } = await admin.from('payment_sessions').insert({
      id: closedCollect, owner: a.id, account_id: accountId, type: 'collect',
      title: 'QA-ANON closed collect', status: 'closed', target_amount_satang: null,
    })
    if (error) throw new Error(`seed closed collect failed: ${error.message}`)
  }

  // An OPEN trip session (account_id must be null for trip), owner auto-joined.
  trip = await seedTripSession(a.id, 'QA-ANON open trip')

  // Seed a real slip into each of the collect + trip sessions (admin) so the
  // read-deny assertions have host-visible rows to (fail to) leak.
  {
    const { error: c } = await admin.from('session_slips').insert({
      session_id: openCollect, amount_satang: 12345, ref_code: 'QAANONCOLLECT',
      paid_at: new Date().toISOString(),
    })
    if (c) throw new Error(`seed collect slip failed: ${c.message}`)
    const { error: t } = await admin.from('session_slips').insert({
      session_id: trip.token, amount_satang: 67890, ref_code: 'QAANONTRIP',
      paid_at: new Date().toISOString(),
    })
    if (t) throw new Error(`seed trip slip failed: ${t.message}`)
  }
})

test.afterAll(async () => {
  const admin = adminClient()
  // Sessions cascade their slips/participants. Delete sessions before the account
  // (payment_sessions.account_id → accounts is RESTRICT, no ON DELETE).
  for (const id of [openCollect, closedCollect, trip?.token].filter(Boolean) as string[]) {
    await admin.from('payment_sessions').delete().eq('id', id)
  }
  if (accountId) await admin.from('accounts').delete().eq('id', accountId)
})

test('ANON-1 (a) a different anon client reads ZERO session_slips (no anon SELECT policy)', async () => {
  const anon = anonClient()
  for (const [label, sid] of [['open collect', openCollect], ['open trip', trip.token]] as const) {
    const { data, error } = await anon.from('session_slips').select('*').eq('session_id', sid)
    // No anon SELECT policy → PostgREST returns an empty set (not an error).
    expect(error, `${label}: SELECT should not error`).toBeNull()
    expect(data ?? [], `${label}: anon read leaked session_slips — DATA LEAK`).toHaveLength(0)
  }
})

test('ANON-2 (b) anon direct INSERT into an OPEN TRIP session is rejected (42501)', async () => {
  const anon = anonClient()
  const { error } = await anon.from('session_slips').insert({
    session_id: trip.token, amount_satang: 100, ref_code: null,
    paid_at: new Date().toISOString(),
  })
  // 0005 scoped anon INSERT to type='collect'; a trip insert must fail the with-check.
  expectRlsDenied(error, 'open trip')
  // And nothing was written: admin sees only the one seeded trip slip.
  const { data } = await adminClient().from('session_slips').select('id').eq('session_id', trip.token)
  expect(data ?? [], 'no anon slip should have landed in the trip session').toHaveLength(1)
})

test('ANON-3 (c) anon direct INSERT into a CLOSED COLLECT session is rejected (42501)', async () => {
  const anon = anonClient()
  const { error } = await anon.from('session_slips').insert({
    session_id: closedCollect, amount_satang: 200, ref_code: null,
    paid_at: new Date().toISOString(),
  })
  // with-check requires status='open'; a closed collect insert must fail.
  expectRlsDenied(error, 'closed collect')
  const { data } = await adminClient().from('session_slips').select('id').eq('session_id', closedCollect)
  expect(data ?? [], 'no anon slip should have landed in the closed collect session').toHaveLength(0)
})

test('ANON-4 (positive control) anon INSERT into an OPEN COLLECT session is ALLOWED', async () => {
  // Proves the deny in ANON-2/3 is scoped to type/status, not a blanket anon-insert
  // ban — and re-verifies M4's Pattern-B guest-pay insert at the RLS layer.
  const anon = anonClient()
  const { error } = await anon.from('session_slips').insert({
    session_id: openCollect, amount_satang: 4200, ref_code: 'QAANONALLOW',
    paid_at: new Date().toISOString(),
  })
  expect(error, `open collect anon INSERT must succeed (Pattern B) — got ${error?.code} "${error?.message}"`).toBeNull()
  // Admin confirms the row actually landed (seeded 1 + this 1 = 2).
  const { data } = await adminClient().from('session_slips').select('id').eq('session_id', openCollect)
  expect(data ?? [], 'the allowed anon slip should be present').toHaveLength(2)
})
