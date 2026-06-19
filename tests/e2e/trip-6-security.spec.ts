import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { env } from './helpers/env'
import { findUserByEmail } from './helpers/admin'
import {
  seedTripSession, deleteTripSession, setTripStatus, apiCtx,
  joinTrip, addExpense, sendTripSlip, type SeededTrip,
} from './helpers/trip'

/**
 * TRIP-6 — Security / RLS (mandatory). All checks hit the real anon API routes
 * or the RLS-governed tables directly. Trip tables have NO anon policy and an
 * owner-only authenticated policy, so a non-owner (User B) and a bare anon client
 * must both read zero. Wrong token, closed session, and the per-IP rate limit are
 * the other guest-facing guarantees. (Privacy — no slip-image on the wire — is
 * exercised in the UI slip flow, trip-4; the only image upload is the expense QR.)
 */

test.describe.configure({ mode: 'serial' })

let trip: SeededTrip
let guestToken = ''
let expenseId = ''

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  trip = await seedTripSession(a.id, 'QA-TRIP-6 security')

  // Seed one guest + an expense + a slip while OPEN (a real ledger to try to leak).
  const api = await apiCtx('198.51.100.10')
  const j = await joinTrip(api, trip.token, 'เอ')
  expect(j.status, 'setup join').toBe(201)
  guestToken = j.participantToken!
  const e = await addExpense(api, trip.token, guestToken, { title: 'ค่าอาหาร', amountSatang: 90000, split: 3 })
  expect(e.status, 'setup expense').toBe(201)
  expenseId = e.expenseId!
  expect(await sendTripSlip(api, trip.token, { participantToken: guestToken, expenseId, amountSatang: 30000, refCode: 'QATRIP6SETUP' }), 'setup slip').toBe(201)
  await api.dispose()
})

test.afterAll(async () => {
  if (trip) await deleteTripSession(trip.token)
})

test('TRIP-6a a different logged-in user (User B) and a bare anon read ZERO of the trip ledger', async () => {
  // User B authenticated: owner RLS policy (owner = auth.uid()) denies → zero rows.
  const b = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signErr } = await b.auth.signInWithPassword({ email: env.userB.email, password: env.userB.password })
  expect(signErr, 'User B sign-in').toBeNull()
  for (const tbl of ['session_participants', 'session_expenses', 'session_slips'] as const) {
    const { data, error } = await b.from(tbl).select('*').eq('session_id', trip.token)
    expect(error, `${tbl} (User B) should not error`).toBeNull()
    expect(data ?? [], `${tbl} leaked to a different logged-in user — DATA LEAK`).toHaveLength(0)
  }

  // Bare anon (no session) — the credential a hostile guest holds.
  const anon = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const tbl of ['session_participants', 'session_expenses', 'session_slips'] as const) {
    const { data } = await anon.from(tbl).select('*').eq('session_id', trip.token)
    expect(data ?? [], `${tbl} leaked to bare anon — DATA LEAK`).toHaveLength(0)
  }
})

test('TRIP-6b a wrong/guessed token is denied with no ledger leak', async ({ browser }) => {
  const bad = 'Zq9wrongTokenZq9wrong' // 21 chars, not a real session id
  const api = await apiCtx('198.51.100.11')
  expect((await joinTrip(api, bad, 'เอ')).status, 'join bad token').toBe(403)
  expect((await addExpense(api, bad, 'whatevertoken', { title: 'x', amountSatang: 100, split: 2 })).status, 'expense bad token').toBe(403)
  expect(await sendTripSlip(api, bad, { participantToken: 'whatevertoken', expenseId: '00000000-0000-0000-0000-000000000000', amountSatang: 100, refCode: null }), 'slip bad token').toBe(403)
  await api.dispose()

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`/pay/${bad}`)
  // A wrong token is indistinguishable from a closed/nonexistent session by
  // design (RLS hides it) — the generic not-found state, never a ledger.
  await expect(page.getByText('ไม่พบรายการนี้')).toBeVisible()
  await ctx.close()
})

test('TRIP-6c a closed trip rejects join / expense / slip (403)', async () => {
  await setTripStatus(trip.token, 'closed')
  const api = await apiCtx('198.51.100.12')
  expect((await joinTrip(api, trip.token, 'ใหม่')).status, 'join closed').toBe(403)
  expect((await addExpense(api, trip.token, guestToken, { title: 'x', amountSatang: 100, split: 2 })).status, 'expense closed').toBe(403)
  expect(await sendTripSlip(api, trip.token, { participantToken: guestToken, expenseId, amountSatang: 100, refCode: null }), 'slip closed').toBe(403)
  await api.dispose()
  await setTripStatus(trip.token, 'open') // restore
})

test('TRIP-6d join over the per-IP limit is throttled (429; ≤10 succeed)', async () => {
  const api = await apiCtx('198.51.100.13')
  const statuses: number[] = []
  for (let i = 0; i < 12; i++) {
    statuses.push((await joinTrip(api, trip.token, `spam${i}`)).status)
  }
  expect(statuses.filter((s) => s === 201).length, 'no more than 10 succeed in the window').toBeLessThanOrEqual(10)
  expect(statuses, 'at least one 429').toContain(429)
  await api.dispose()
})
