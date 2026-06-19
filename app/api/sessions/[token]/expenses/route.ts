import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tripExpenseSchema } from '@/lib/validators/session'
import { findParticipant } from '@/lib/trip-server'
import { uploadTripQr, TRIP_QR_MAX_BYTES } from '@/lib/trip-storage'

// Anonymous participant adds an expense they fronted, with their own receiving QR.
// Rate-limited in middleware.ts. Validates: open trip session + the caller's
// participant_token belongs to it. payer is resolved server-side (never trusted
// from the client). QR upload + insert run via the admin client.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const parsed = tripExpenseSchema.safeParse({
    participant_token: form.get('participant_token'),
    title: form.get('title'),
    total_amount_satang: Number(form.get('total_amount_satang')),
    split_among: Number(form.get('split_among')),
  })
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

  const expenseId = crypto.randomUUID()
  let qrPath: string | null = null
  const file = form.get('qr')
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
    }
    if (file.size > TRIP_QR_MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 400 })
    }
    try {
      qrPath = await uploadTripQr(token, expenseId, file)
    } catch {
      return NextResponse.json({ error: 'QR upload failed' }, { status: 500 })
    }
  }

  const { error } = await admin.from('session_expenses').insert({
    id: expenseId,
    session_id: token,
    payer_participant_id: participant.id,
    title: parsed.data.title,
    total_amount_satang: parsed.data.total_amount_satang,
    split_among: parsed.data.split_among,
    qr_image_path: qrPath,
  })
  if (error) {
    return NextResponse.json({ error: 'Could not add expense' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, expenseId }, { status: 201 })
}
