import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import { buildLastAccountMap } from '@/lib/last-account'
import { budgetStatus, type BudgetRow, type ExpenseRow } from '@/lib/budget'
import { formatTHB } from '@/lib/money'
import QuickAddCard from '@/components/quick-add-card'
import HomeTodayList from '@/components/home-today-list'

/**
 * Home — J1 "one glance + one action" (design v3, replaces the old
 * dashboard-as-home). No chart, no gradient hero, no mascot block, no
 * account list, no shortcuts grid: quick-add + today's transactions only.
 * Budget status is a single plain-text line linking to งบ (charts + full
 * budget bars live there now, per J6). Keeping this route Recharts-free is
 * itself an M9 acceptance criterion — do not import the chart components here.
 */
export default async function DashboardPage() {
  const t = await getTranslations('dashboard')
  const supabase = await createClient()

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const todayStart = `${todayStr}T00:00:00+07:00`
  const todayEnd = `${todayStr}T23:59:59.999+07:00`
  const month = todayStr.slice(0, 7)
  const monthStart = `${month}-01T00:00:00+07:00`

  // The refetch pass must attach an AbortSignal: Next memoizes identical GET
  // fetches within one render, so without it a re-run after materialization
  // would be handed the pre-insert response instead of hitting Supabase again.
  const fetchData = (fresh = false) => {
    const today = supabase
      .from('transactions')
      .select('*')
      .gte('datetime', todayStart)
      .lte('datetime', todayEnd)
      .order('datetime', { ascending: false })
    // This month's income/expense — feeds both the budget one-liner and the
    // per-category last-used-account default the detail sheet's edit form uses.
    const monthTx = supabase
      .from('transactions')
      .select('amount_satang, category, datetime, account_id, type')
      .in('type', ['income', 'expense'])
      .gte('datetime', monthStart)
      .order('datetime', { ascending: false })
    return Promise.all([
      fresh ? today.abortSignal(new AbortController().signal) : today,
      fresh ? monthTx.abortSignal(new AbortController().signal) : monthTx,
    ])
  }

  const { from: matFrom, to: matTo } = currentMonthRange(now)
  const [[{ data: accounts }, { data: budgets }, { data: balances }], mat, first] = await Promise.all([
    Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('budgets').select('*'),
      supabase.rpc('account_balances'),
    ]),
    materializeOccurrences(matFrom, matTo),
    fetchData(),
  ])
  const [{ data: todayTx }, { data: monthTx }] = mat.inserted ? await fetchData(true) : first

  const balanceByAccount = new Map((balances ?? []).map((b) => [b.account_id, b.balance_satang]))
  const totalBalance = (accounts ?? []).reduce(
    (sum, acct) => sum + (balanceByAccount.get(acct.id) ?? acct.opening_balance_satang ?? 0),
    0,
  )

  const monthExpense = (monthTx ?? [])
    .filter((r) => r.type === 'expense')
    .reduce((s, r) => s + r.amount_satang, 0)

  const overallBudget = ((budgets ?? []) as BudgetRow[]).find((b) => b.scope === 'overall')
  const overallStatus = overallBudget
    ? budgetStatus(overallBudget, (monthTx ?? []) as ExpenseRow[], now)
    : null

  const lastByCategory = buildLastAccountMap(monthTx ?? [])
  const globalLastAccountId = monthTx?.[0]?.account_id ?? null

  return (
    <div className="space-y-6">
      {/* Focal total balance — flat, one accent (the number itself), no
          gradient/mascot behind it. Budget status is plain text underneath. */}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('totalBalance')}</p>
        <p className="text-focal text-4xl font-bold leading-tight tabular-nums">
          {formatTHB(totalBalance)}
        </p>
        <Link href="/budgets" className="block text-sm text-muted-foreground hover:text-foreground">
          {t('monthExpenseLine', { amount: formatTHB(monthExpense) })}
          {overallStatus && (
            <> · {t('budgetRemainingLine', { amount: formatTHB(overallStatus.remaining) })}</>
          )}
        </Link>
      </div>

      <QuickAddCard />

      <HomeTodayList
        transactions={todayTx ?? []}
        accounts={accounts ?? []}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
      />
    </div>
  )
}
