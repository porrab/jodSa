import { createClient } from '@/lib/supabase/server'
import { groupExpenseTotal } from '@/lib/group'
import GroupsClient, { type GroupItem } from './groups-client'

export default async function GroupsPage() {
  const supabase = await createClient()

  const [{ data: groups }, { data: txs }] = await Promise.all([
    supabase.from('groups').select('*').order('title'),
    supabase.from('transactions').select('type, amount_satang, group_id').not('group_id', 'is', null),
  ])

  const items: GroupItem[] = (groups ?? []).map((g) => {
    const members = (txs ?? []).filter((t) => t.group_id === g.id)
    return {
      id: g.id,
      title: g.title,
      note: g.note,
      spent: groupExpenseTotal(members),
      count: members.length,
    }
  })

  return (
    <div className="space-y-6">
      <GroupsClient groups={items} />
    </div>
  )
}
