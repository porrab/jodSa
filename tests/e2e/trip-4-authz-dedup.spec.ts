import { test, expect } from '@playwright/test'
import { env } from './helpers/env'
import { findUserByEmail } from './helpers/admin'
import {
  seedTripSession, deleteTripSession, apiCtx,
  joinTrip, addExpense, sendTripSlip, confirmSlip, adminSlipsForExpense, type SeededTrip,
} from './helpers/trip'

/**
 * TRIP-4 (API half) — slip dedup + confirm authorization. The UI parse/manual
 * send + the payer's confirm toggle are exercised in trip-4-slip-ui. Here we pin
 * the server-side guarantees that a UI test can't reliably force:
 *   • re-sending a slip with the SAME ref_code → 409; manual (null ref) is never deduped
 *   • only the participant who FRONTED the expense may confirm its slips (else 403)
 */

test.describe.configure({ mode: 'serial' })

let trip: SeededTrip
let expenseId = ''
let bToken = '' // ower B
let cToken = '' // bystander C (neither payer nor the slip sender)

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  trip = await seedTripSession(a.id, 'QA-TRIP-4 authz')

  const api = await apiCtx('198.51.100.20')
  const b = await joinTrip(api, trip.token, 'บี'); expect(b.status).toBe(201); bToken = b.participantToken!
  const c = await joinTrip(api, trip.token, 'ซี'); expect(c.status).toBe(201); cToken = c.participantToken!
  // Owner A (seeded participant) FRONTS the expense → A is the payer/confirmer.
  const e = await addExpense(api, trip.token, trip.ownerParticipantToken, { title: 'ค่าที่พัก', amountSatang: 120000, split: 3 })
  expect(e.status).toBe(201); expenseId = e.expenseId!
  await api.dispose()
})

test.afterAll(async () => { if (trip) await deleteTripSession(trip.token) })

test('TRIP-4 re-sending the same ref_code is rejected as duplicate (409); manual null-ref is allowed', async () => {
  const api = await apiCtx('198.51.100.21')
  // First ref-coded slip → 201
  expect(await sendTripSlip(api, trip.token, { participantToken: bToken, expenseId, amountSatang: 40000, refCode: 'DUPREF-TRIP4' })).toBe(201)
  // Same ref again → 409 duplicate
  expect(await sendTripSlip(api, trip.token, { participantToken: bToken, expenseId, amountSatang: 40000, refCode: 'DUPREF-TRIP4' })).toBe(409)
  // Two manual null-ref slips → both accepted (nulls are not deduped)
  expect(await sendTripSlip(api, trip.token, { participantToken: bToken, expenseId, amountSatang: 40000, refCode: null })).toBe(201)
  expect(await sendTripSlip(api, trip.token, { participantToken: bToken, expenseId, amountSatang: 40000, refCode: null })).toBe(201)
  await api.dispose()
})

test('TRIP-4 only the expense payer may confirm its slips (others → 403)', async () => {
  const slips = await adminSlipsForExpense(trip.token, expenseId)
  expect(slips.length, 'setup slips exist').toBeGreaterThan(0)
  const slipId = slips[0].id

  const api = await apiCtx('198.51.100.22')
  // C (a bystander participant) must NOT be able to confirm
  expect(await confirmSlip(api, trip.token, slipId, cToken, true), 'bystander C confirm').toBe(403)
  // B (the slip sender / ower, but not the payer) must NOT be able to confirm
  expect(await confirmSlip(api, trip.token, slipId, bToken, true), 'ower B confirm').toBe(403)
  // A (the expense payer) CAN confirm
  expect(await confirmSlip(api, trip.token, slipId, trip.ownerParticipantToken, true), 'payer A confirm').toBe(200)
  await api.dispose()

  // The confirm actually stuck.
  const after = await adminSlipsForExpense(trip.token, expenseId)
  expect(after.find((s) => s.id === slipId)?.confirmed, 'slip is now confirmed').toBe(true)
})
