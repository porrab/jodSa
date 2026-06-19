import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'
import PayClient from './pay-client'
import TripClient from './trip-client'
import { loadTripLedger } from '@/lib/trip-server'

export const dynamic = 'force-dynamic'

// GUEST page — no login. The token in the URL is the capability: the anon
// client below can only see this session while it is OPEN (RLS Pattern B).
export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const anon = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: session } = await anon
    .from('payment_sessions')
    .select('id, title, target_amount_satang, account_id, type')
    .eq('id', token)
    .maybeSingle()

  if (!session) {
    // RLS hides closed sessions from anon, so "closed" and "nonexistent" are
    // indistinguishable here — by design.
    return <PayClient token={token} session={null} qrUrl={null} />
  }

  // Trip session: a shared ledger. Token validated via the anon read above; the
  // ledger itself is read server-side with the admin client (trip tables have no
  // anon policy).
  if (session.type === 'trip') {
    const ledger = await loadTripLedger(token)
    return <TripClient token={token} title={session.title} ledger={ledger} />
  }

  // Trusted server-only read: the open-session token was just validated via the
  // anon client above. The admin client ONLY resolves the host QR path and signs
  // a short-lived URL — guests have no storage policy of their own.
  let qrUrl: string | null = null
  const admin = createAdminClient()
  const { data: account } = await admin
    .from('accounts')
    .select('qr_image_path')
    .eq('id', session.account_id ?? '')
    .single()
  if (account?.qr_image_path) {
    const { data: signed } = await admin.storage
      .from('bank-qr')
      .createSignedUrl(account.qr_image_path, 3600)
    qrUrl = signed?.signedUrl ?? null
  }

  return (
    <PayClient
      token={token}
      session={{ title: session.title, targetAmountSatang: session.target_amount_satang }}
      qrUrl={qrUrl}
    />
  )
}
