import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guestSlipSchema } from '@/lib/validators/session'
import type { Database } from '@/lib/supabase/types'

// Guest slip POST — rate-limited in middleware.ts. Insert runs as the bare
// anon role so RLS is the authority: only OPEN sessions accept inserts, and
// the unique (session_id, ref_code) index blocks duplicate slips.
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
