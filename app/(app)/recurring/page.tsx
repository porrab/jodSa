import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import RecurringClient from '@/components/recurring-form'

export default async function RecurringPage() {
  const t = await getTranslations('recurring')
  const supabase = await createClient()

  const [{ data: rules }, { data: accounts }] = await Promise.all([
    supabase.from('recurring_rules').select('*').order('start_date', { ascending: false }),
    supabase.from('accounts').select('id, name, bank').order('created_at'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <RecurringClient rules={rules ?? []} accounts={accounts ?? []} />
    </div>
  )
}
