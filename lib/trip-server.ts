// Server-only admin reads + guards for trip sessions. Anonymous participants
// have no RLS policy on the trip tables, so the shared ledger is read here via
// the service-role client AFTER the capability token (the URL) has been treated
// as the credential. Mirrors app/pay/[token]/page.tsx (token → admin read).
// NEVER import from client code.
import { createAdminClient } from '@/lib/supabase/admin'
import { signTripQrUrl } from '@/lib/trip-storage'

export type TripParticipant = { id: string; nickname: string; is_owner: boolean }
export type TripExpense = {
  id: string
  payer_participant_id: string
  title: string
  total_amount_satang: number
  split_among: number
}
export type TripSlip = {
  id: string
  expense_id: string | null
  payer_participant_id: string | null
  amount_satang: number
  ref_code: string | null
  paid_at: string
  confirmed: boolean
}

export type TripLedger = {
  participants: TripParticipant[]
  expenses: TripExpense[]
  slips: TripSlip[]
  qrByExpense: Record<string, string | null>
}

// Resolve a participant by their secret token within a session. Returns null if
// the token doesn't belong to this session.
export async function findParticipant(sessionId: string, participantToken: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('session_participants')
    .select('id, is_owner')
    .eq('session_id', sessionId)
    .eq('participant_token', participantToken)
    .maybeSingle()
  return data
}

export async function tripHeadcount(sessionId: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('session_participants')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  return count ?? 0
}

// Full ledger for rendering. QR paths are signed to short-lived URLs.
export async function loadTripLedger(sessionId: string): Promise<TripLedger> {
  const admin = createAdminClient()
  const [{ data: participants }, { data: expenses }, { data: slips }] = await Promise.all([
    admin.from('session_participants').select('id, nickname, is_owner')
      .eq('session_id', sessionId).order('created_at'),
    admin.from('session_expenses')
      .select('id, payer_participant_id, title, total_amount_satang, split_among, qr_image_path')
      .eq('session_id', sessionId).order('created_at'),
    admin.from('session_slips')
      .select('id, expense_id, payer_participant_id, amount_satang, ref_code, paid_at, confirmed')
      .eq('session_id', sessionId).not('expense_id', 'is', null).order('created_at'),
  ])

  const qrByExpense: Record<string, string | null> = {}
  for (const e of expenses ?? []) {
    qrByExpense[e.id] = await signTripQrUrl(e.qr_image_path)
  }

  return {
    participants: (participants ?? []) as TripParticipant[],
    // qr_image_path is dropped from the client payload (signed URLs go via
    // qrByExpense instead — raw storage paths never reach the browser).
    expenses: (expenses ?? []).map((e) => ({
      id: e.id,
      payer_participant_id: e.payer_participant_id,
      title: e.title,
      total_amount_satang: e.total_amount_satang,
      split_among: e.split_among,
    })),
    slips: (slips ?? []) as TripSlip[],
    qrByExpense,
  }
}
