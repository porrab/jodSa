import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { findParticipant } from '@/lib/trip-server'

const confirmSchema = z.object({
  participant_token: z.string().min(1).max(64),
  confirmed: z.boolean(),
})

// Anonymous confirm: only the participant who FRONTED the expense may confirm /
// unconfirm slips sent toward it. Rate-limited in middleware.ts.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const participant = await findParticipant(token, parsed.data.participant_token)
  if (!participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: slip } = await admin
    .from('session_slips')
    .select('id, expense_id, session_id')
    .eq('id', id)
    .eq('session_id', token)
    .maybeSingle()
  if (!slip || !slip.expense_id) {
    return NextResponse.json({ error: 'Slip not found' }, { status: 404 })
  }

  const { data: expense } = await admin
    .from('session_expenses')
    .select('payer_participant_id')
    .eq('id', slip.expense_id)
    .maybeSingle()
  if (!expense || expense.payer_participant_id !== participant.id) {
    return NextResponse.json({ error: 'Not your expense' }, { status: 403 })
  }

  const { error } = await admin
    .from('session_slips')
    .update({ confirmed: parsed.data.confirmed })
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: 'Could not update' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
