import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SessionDetailClient from './session-detail-client'
import TripManageClient from './trip-manage-client'
import { loadTripLedger } from '@/lib/trip-server'

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('payment_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!session) notFound()

  // Trip session → owner management view (ledger + owner controls).
  if (session.type === 'trip') {
    const { data: { user } } = await supabase.auth.getUser()
    const [ledger, { data: me }, { data: accountsWithQr }] = await Promise.all([
      loadTripLedger(id),
      supabase
        .from('session_participants')
        .select('id, participant_token, nickname')
        .eq('session_id', id)
        .eq('user_id', user?.id ?? '')
        .maybeSingle(),
      // Owner's accounts that already have a saved receiving QR — offered as a
      // "use saved QR" option when adding an expense.
      supabase
        .from('accounts')
        .select('id, name, bank, qr_image_path')
        .not('qr_image_path', 'is', null)
        .order('created_at'),
    ])
    const seed = me
      ? { participantId: me.id, participantToken: me.participant_token, nickname: me.nickname }
      : null
    return (
      <TripManageClient
        session={{ id: session.id, title: session.title, status: session.status }}
        ledger={ledger}
        seed={seed}
        accountsWithQr={(accountsWithQr ?? []).map((a) => ({ id: a.id, name: a.name, bank: a.bank }))}
      />
    )
  }

  const [{ data: slips }, { data: account }] = await Promise.all([
    supabase
      .from('session_slips')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('accounts')
      .select('name, bank, qr_image_path')
      .eq('id', session.account_id ?? '')
      .single(),
  ])

  let qrUrl: string | null = null
  if (account?.qr_image_path) {
    const { data: signed } = await supabase.storage
      .from('bank-qr')
      .createSignedUrl(account.qr_image_path, 3600)
    qrUrl = signed?.signedUrl ?? null
  }

  return (
    <SessionDetailClient
      session={session}
      slips={slips ?? []}
      accountLabel={account ? `${account.name} (${account.bank})` : ''}
      qrUrl={qrUrl}
    />
  )
}
