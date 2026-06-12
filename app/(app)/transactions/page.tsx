import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import TransactionsClient from './transactions-client'

export default async function TransactionsPage() {
  const t = await getTranslations('transaction')
  const supabase = await createClient()

  // Lazy-on-read: create any due recurring occurrences for the current month
  // before we list transactions.
  const { from, to } = currentMonthRange()
  await materializeOccurrences(from, to)

  const [{ data: transactions }, { data: accounts }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .order('datetime', { ascending: false })
      .limit(200),
    supabase.from('accounts').select('*').order('created_at'),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <TransactionsClient
        transactions={transactions ?? []}
        accounts={accounts ?? []}
      />
    </div>
  )
}
