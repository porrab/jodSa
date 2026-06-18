import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import { buildLastAccountMap } from '@/lib/last-account'
import TransactionsClient from './transactions-client'

export default async function TransactionsPage() {
  const t = await getTranslations('transaction')
  const supabase = await createClient()

  // Lazy-on-read: create any due recurring occurrences for the current month
  // before we list transactions.
  const { from, to } = currentMonthRange()
  await materializeOccurrences(from, to)

  const [{ data: transactions }, { data: accounts }, { data: history }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .order('datetime', { ascending: false })
      .limit(200),
    supabase.from('accounts').select('*').order('created_at'),
    // Seed for the per-category last-used-account default in the log form.
    // Income/expense only — transfers don't carry a category. Bounded so a
    // long-lived account doesn't pull thousands of rows.
    supabase
      .from('transactions')
      .select('category, account_id')
      .in('type', ['income', 'expense'])
      .order('datetime', { ascending: false })
      .limit(500),
  ])

  const lastByCategory = buildLastAccountMap(history ?? [])
  const globalLastAccountId = history?.[0]?.account_id ?? null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <TransactionsClient
        transactions={transactions ?? []}
        accounts={accounts ?? []}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
      />
    </div>
  )
}
