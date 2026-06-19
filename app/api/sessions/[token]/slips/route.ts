import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guestSlipSchema, tripSlipSchema } from '@/lib/validators/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { findParticipant } from '@/lib/trip-server'
import type { Database } from '@/lib/supabase/types'

// Guest slip POST — rate-limited in middleware.ts.
//
// Two shapes share this endpoint:
//  • collect (no expense_id): insert as the bare anon role so RLS is the
//    authority — only OPEN sessions accept inserts.
//  • trip (expense_id + participant_token present): validate the token + payer +
//    expense server-side, then insert via the admin client (trip tables have no
//    anon policy). The slip is bound to the expense and the paying participant.
// The unique (session_id, ref_code) index blocks duplicate slips either way.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Trip slip path
  if (body && typeof body === 'object' && 'expense_id' in body) {
    const parsed = tripSlipSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const admin = createAdminClient()
    const { data: session } = await admin
      .from('payment_sessions').select('id, status, type').eq('id', token).maybeSingle()
    if (!session || session.type !== 'trip' || session.status !== 'open') {
      return NextResponse.json({ error: 'Session is closed or does not exist' }, { status: 403 })
    }
    const participant = await findParticipant(token, parsed.data.participant_token)
    if (!participant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }
    const { data: expense } = await admin
      .from('session_expenses').select('id').eq('id', parsed.data.expense_id).eq('session_id', token).maybeSingle()
    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }
    const { error } = await admin.from('session_slips').insert({
      session_id: token,
      expense_id: parsed.data.expense_id,
      payer_participant_id: participant.id,
      amount_satang: parsed.data.amount_satang,
      ref_code: parsed.data.ref_code,
      paid_at: parsed.data.paid_at,
    })
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Duplicate slip (ref_code already recorded)' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Could not record slip' }, { status: 500 })
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  }

  // Collect slip path (unchanged)
  const parsed = guestSlipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const anon = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { error } = await anon.from('session_slips').insert({
    session_id: token,
    ...parsed.data,
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Duplicate slip (ref_code already recorded)' }, { status: 409 })
    }
    // RLS denial (42501) or FK violation (23503) → session missing or closed.
    // Don't leak which: the token is the only credential a guest holds.
    return NextResponse.json({ error: 'Session is closed or does not exist' }, { status: 403 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
