import { nanoid } from 'nanoid'
import { request as pwRequest, expect, type APIRequestContext, type Locator } from '@playwright/test'
import { adminClient } from './admin'

/**
 * Prod-build hydration race guard. On `next start` under load, the FIRST
 * interaction after a navigation/reload can be swallowed before React attaches
 * its onClick handler (the DOM node is visible+stable, but not yet hydrated), so
 * a single click silently no-ops. Both helpers are STATE-GUARDED: they act only
 * while the expected effect is absent and retry until it's observed — idempotent,
 * so a click that DID register (just slowly) is never toggled back off.
 */

/** Turn a shadcn Switch ON, defeating a swallowed first click. */
export async function ensureSwitchOn(sw: Locator, timeout = 20_000): Promise<void> {
  await expect(async () => {
    if (!(await sw.isChecked())) await sw.click()
    await expect(sw).toBeChecked({ timeout: 3_000 })
  }).toPass({ timeout })
}

/** Click `trigger` until `appears` becomes visible (e.g. a status/label flip). */
export async function clickUntilVisible(trigger: Locator, appears: Locator, timeout = 20_000): Promise<void> {
  await expect(async () => {
    if (!(await appears.isVisible())) await trigger.click()
    await expect(appears).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout })
}

/**
 * Trip-session test helpers (M6 / TRIP). Setup-only admin seeding mirrors the
 * `createSession(type='trip')` server action (insert session + auto-join the
 * owner as an is_owner participant); the join/expense/slip/confirm helpers drive
 * the REAL anon API routes over HTTP, so the token + RLS + rate-limit stack stays
 * fully exercised. Every assertion in the specs goes through those routes or the
 * UI — admin is never used to fake app behavior, only to seed/inspect.
 */

export type SeededTrip = {
  token: string
  ownerParticipantId: string
  ownerParticipantToken: string
}

/** Seed an OPEN trip session owned by `ownerUserId`, owner auto-joined. */
export async function seedTripSession(ownerUserId: string, title: string): Promise<SeededTrip> {
  const a = adminClient()
  const token = nanoid(21)
  const { error: sErr } = await a.from('payment_sessions').insert({
    id: token, owner: ownerUserId, account_id: null, type: 'trip',
    title, target_amount_satang: null, status: 'open',
  })
  if (sErr) throw new Error(`seedTripSession (session) failed: ${sErr.message}`)
  const ownerToken = nanoid(21)
  const { data, error: pErr } = await a.from('session_participants').insert({
    session_id: token, nickname: 'เจ้าของทริป', participant_token: ownerToken,
    user_id: ownerUserId, is_owner: true,
  }).select('id').single()
  if (pErr || !data) throw new Error(`seedTripSession (owner participant) failed: ${pErr?.message}`)
  return { token, ownerParticipantId: data.id, ownerParticipantToken: ownerToken }
}

/** Delete a trip session (cascades participants/expenses/slips). */
export async function deleteTripSession(token: string): Promise<void> {
  const { error } = await adminClient().from('payment_sessions').delete().eq('id', token)
  if (error) throw new Error(`deleteTripSession failed: ${error.message}`)
}

/** Clear every session a user owns (trip sessions don't cascade via account delete). */
export async function clearOwnerSessions(ownerUserId: string): Promise<void> {
  const { error } = await adminClient().from('payment_sessions').delete().eq('owner', ownerUserId)
  if (error) throw new Error(`clearOwnerSessions failed: ${error.message}`)
}

export async function setTripStatus(token: string, status: 'open' | 'closed'): Promise<void> {
  const { error } = await adminClient().from('payment_sessions').update({ status }).eq('id', token)
  if (error) throw new Error(`setTripStatus failed: ${error.message}`)
}

/** A fresh APIRequestContext bound to a distinct rate-limit bucket (per-IP key). */
export async function apiCtx(ipBucket: string): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'x-forwarded-for': ipBucket },
  })
}

export async function joinTrip(api: APIRequestContext, token: string, nickname: string) {
  const res = await api.post(`/api/sessions/${token}/join`, { data: { nickname } })
  const body = res.ok() ? await res.json() : null
  return { status: res.status(), participantId: body?.participantId as string | undefined, participantToken: body?.participantToken as string | undefined }
}

export async function addExpense(
  api: APIRequestContext,
  token: string,
  participantToken: string,
  opts: { title: string; amountSatang: number; split: number; qr?: { name: string; mimeType: string; buffer: Buffer } },
) {
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    participant_token: participantToken,
    title: opts.title,
    total_amount_satang: String(opts.amountSatang),
    split_among: String(opts.split),
  }
  if (opts.qr) multipart.qr = opts.qr
  const res = await api.post(`/api/sessions/${token}/expenses`, { multipart })
  const body = res.status() === 201 ? await res.json() : null
  return { status: res.status(), expenseId: body?.expenseId as string | undefined }
}

export async function sendTripSlip(
  api: APIRequestContext,
  token: string,
  data: { participantToken: string; expenseId: string; amountSatang: number; refCode: string | null; paidAt?: string },
) {
  const res = await api.post(`/api/sessions/${token}/slips`, {
    data: {
      participant_token: data.participantToken,
      expense_id: data.expenseId,
      amount_satang: data.amountSatang,
      ref_code: data.refCode,
      paid_at: data.paidAt ?? new Date().toISOString(),
    },
  })
  return res.status()
}

export async function confirmSlip(
  api: APIRequestContext,
  token: string,
  slipId: string,
  participantToken: string,
  confirmed: boolean,
) {
  const res = await api.post(`/api/sessions/${token}/slips/${slipId}/confirm`, {
    data: { participant_token: participantToken, confirmed },
  })
  return res.status()
}

/** Read the slips bound to a trip (admin) — used to grab slip ids for authz tests. */
export async function adminSlipsForExpense(token: string, expenseId: string) {
  const { data, error } = await adminClient()
    .from('session_slips')
    .select('id, payer_participant_id, confirmed, amount_satang')
    .eq('session_id', token)
    .eq('expense_id', expenseId)
    .order('created_at')
  if (error) throw new Error(`adminSlipsForExpense failed: ${error.message}`)
  return data ?? []
}
