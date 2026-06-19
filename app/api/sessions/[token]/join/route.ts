import { NextResponse, type NextRequest } from 'next/server'
import { nanoid } from 'nanoid'
import { createAdminClient } from '@/lib/supabase/admin'
import { joinSchema } from '@/lib/validators/session'

// Anonymous join to a trip session. Rate-limited in middleware.ts. The URL token
// is the credential; we only let people join an OPEN trip session. Returns a
// fresh participant_token the caller stores in localStorage to prove "me" later.
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

  const parsed = joinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: session } = await admin
    .from('payment_sessions')
    .select('id, status, type')
    .eq('id', token)
    .maybeSingle()
  if (!session || session.type !== 'trip' || session.status !== 'open') {
    return NextResponse.json({ error: 'Session is closed or does not exist' }, { status: 403 })
  }

  const participantToken = nanoid(21)
  const { data, error } = await admin
    .from('session_participants')
    .insert({ session_id: token, nickname: parsed.data.nickname, participant_token: participantToken })
    .select('id')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: 'Could not join' }, { status: 500 })
  }

  return NextResponse.json(
    { participantId: data.id, participantToken },
    { status: 201 },
  )
}
