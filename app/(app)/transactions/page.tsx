import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import { buildLastAccountMap } from '@/lib/last-account'
import TransactionsClient from './transactions-client'

export default async function TransactionsPage() {
  const t = await getTranslations('transaction')
  const supabase = await createClient()

  // The refetch pass must attach an AbortSignal: Next memoizes identical GET
  // fetches within one render, so without it the re-run would be handed the
  // pre-insert responses instead of hitting Supabase again.
  const fetchData = (fresh = false) => {
    const list = supabase
      .from('transactions')
      .select('*')
      .order('datetime', { ascending: false })
      .limit(200)
    // Seed for the per-category last-used-account default in the log form.
    // Income/expense only — transfers don't carry a category. Bounded so a
    // long-lived account doesn't pull thousands of rows.
    const history = supabase
      .from('transactions')
      .select('category, account_id')
      .in('type', ['income', 'expense'])
      .order('datetime', { ascending: false })
      .limit(500)
    return Promise.all([
      fresh ? list.abortSignal(new AbortController().signal) : list,
      supabase.from('accounts').select('*').order('created_at'),
      fresh ? history.abortSignal(new AbortController().signal) : history,
    ])
  }

  // Lazy-on-read: create any due recurring occurrences for the current month.
  // It runs concurrently with the list reads; when it inserted rows the reads
  // re-run so the list includes the new occurrences.
  const { from, to } = currentMonthRange()
  const [mat, first, { data: groups }] = await Promise.all([
    materializeOccurrences(from, to),
    fetchData(),
    // Groups (M3) left the nav in the design v3 reset (J5 — one "ทริป" concept
    // instead of two overlapping ones); existing grouped data stays reachable
    // here as a filter chip instead.
    supabase.from('groups').select('id, title').order('title'),
  ])
  const [{ data: transactions }, { data: accounts }, { data: history }] = mat.inserted
    ? await fetchData(true)
    : first

  const lastByCategory = buildLastAccountMap(history ?? [])
  const globalLastAccountId = history?.[0]?.account_id ?? null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <TransactionsClient
        transactions={transactions ?? []}
        accounts={accounts ?? []}
        groups={groups ?? []}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
      />
    </div>
  )
}
