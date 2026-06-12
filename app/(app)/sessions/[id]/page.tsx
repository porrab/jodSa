import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SessionDetailClient from './session-detail-client'

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

  const [{ data: slips }, { data: account }] = await Promise.all([
    supabase
      .from('session_slips')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('accounts')
      .select('name, bank, qr_image_path')
      .eq('id', session.account_id)
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
