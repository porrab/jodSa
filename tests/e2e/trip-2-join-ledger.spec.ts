import { test, expect } from '@playwright/test'
import { env } from './helpers/env'
import { findUserByEmail } from './helpers/admin'
import { seedTripSession, deleteTripSession, clearOwnerSessions, type SeededTrip } from './helpers/trip'

/**
 * TRIP-2 — anonymous join + ledger + persistence + headcount. A logged-out guest
 * joins with a nickname, stays joined across a browser restart (localStorage), and
 * a second guest's join bumps the member count after refresh. The owner is an
 * auto-joined participant, so the count starts at 1.
 */

test.describe.configure({ mode: 'serial' })

let trip: SeededTrip

test.beforeAll(async () => {
  const a = await findUserByEmail(env.userA.email)
  if (!a) throw new Error(`test user A missing: ${env.userA.email}`)
  await clearOwnerSessions(a.id)
  trip = await seedTripSession(a.id, 'QA-TRIP-2 ทริปทะเล') // owner auto-joined → 1 member
})

test.afterAll(async () => { if (trip) await deleteTripSession(trip.token) })

test('TRIP-2 guest joins, stays joined across restart, headcount grows with a 2nd guest', async ({ browser }) => {
  // ── Guest 1: fresh logged-out context → join form → join
  const g1ctx = await browser.newContext()
  const g1 = await g1ctx.newPage()
  await g1.goto(`/pay/${trip.token}`)
  await expect(g1.getByRole('heading', { name: 'เข้าร่วมทริป' })).toBeVisible()
  await g1.getByLabel('ชื่อเล่น').fill('เอ')
  await g1.getByRole('button', { name: 'เข้าร่วม' }).click()

  // Joined → ledger renders, join form gone. Owner + guest1 = 2 members.
  await expect(g1.getByText('รายการในทริป')).toBeVisible()
  await expect(g1.getByRole('heading', { name: 'เข้าร่วมทริป' })).toBeHidden()
  await expect(g1.getByText('สมาชิก 2 คน')).toBeVisible()

  // ── Restart persistence: same identity from localStorage, no re-join prompt
  const g1state = await g1ctx.storageState()
  await g1ctx.close()
  const g1bctx = await browser.newContext({ storageState: g1state })
  const g1b = await g1bctx.newPage()
  await g1b.goto(`/pay/${trip.token}`)
  await expect(g1b.getByText('รายการในทริป')).toBeVisible()
  await expect(g1b.getByRole('heading', { name: 'เข้าร่วมทริป' })).toBeHidden()

  // ── Guest 2: a different nickname → 3 members
  const g2ctx = await browser.newContext()
  const g2 = await g2ctx.newPage()
  await g2.goto(`/pay/${trip.token}`)
  await g2.getByLabel('ชื่อเล่น').fill('บี')
  await g2.getByRole('button', { name: 'เข้าร่วม' }).click()
  await expect(g2.getByText('รายการในทริป')).toBeVisible()
  await expect(g2.getByText('สมาชิก 3 คน')).toBeVisible()

  // ── Guest 1 reload reflects the new headcount after refresh
  await g1b.reload()
  await expect(g1b.getByText('สมาชิก 3 คน')).toBeVisible()

  await g1bctx.close()
  await g2ctx.close()
})
