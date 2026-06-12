import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { groupExpenseTotal } from '@/lib/group'
import GroupsClient, { type GroupItem } from './groups-client'

export default async function GroupsPage() {
  const t = await getTranslations('group')
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
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <GroupsClient groups={items} />
    </div>
  )
}
