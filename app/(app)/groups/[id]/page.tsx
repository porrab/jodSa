import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GroupDetailClient from './group-detail-client'

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: group } = await supabase.from('groups').select('*').eq('id', id).maybeSingle()
  if (!group) notFound()

  const [{ data: accounts }, { data: members }, { data: candidates }] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.from('transactions').select('*').eq('group_id', id).order('datetime', { ascending: false }),
    supabase
      .from('transactions')
      .select('*')
      .is('group_id', null)
      .order('datetime', { ascending: false })
      .limit(100),
  ])

  return (
    <GroupDetailClient
      group={group}
      accounts={accounts ?? []}
      members={members ?? []}
      candidates={candidates ?? []}
    />
  )
}
