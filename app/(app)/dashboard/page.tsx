import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import { budgetStatus, type BudgetRow, type ExpenseRow } from '@/lib/budget'
import { formatTHB, computeAccountBalance } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import BudgetBar from '@/components/budget-bar'
import QuickAddCard from '@/components/quick-add-card'
import DashboardShortcuts from '@/components/dashboard-shortcuts'
import { Mascot } from '@/components/mascot'
import { HeroBalance } from '@/components/hero-balance'
import LazyIncomeExpenseChart from '@/components/charts/lazy-income-expense-chart'
import type { MonthlyPoint } from '@/components/charts/income-expense-chart'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default async function DashboardPage() {
  const t = await getTranslations('dashboard')
  const supabase = await createClient()

  const now = new Date()
  const monthStart = startOfMonth(now).toISOString()
  const monthEnd = endOfMonth(now).toISOString()

  const chartStart = startOfMonth(subMonths(now, 5))

  // accounts + budgets don't depend on recurring materialization, so fetch them
  // concurrently with it instead of waiting behind it.
  const independent = Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.from('budgets').select('*'),
  ])

  // Lazy-on-read: the transaction reads below count materialized occurrences
  // (real rows), so they must wait until materialization has written them.
  const { from: matFrom, to: matTo } = currentMonthRange(now)
  await materializeOccurrences(matFrom, matTo)

  const [
    [{ data: accounts }, { data: budgets }],
    [{ data: allTx }, { data: monthTx }, { data: chartTx }],
  ] = await Promise.all([
    independent,
    Promise.all([
      supabase.from('transactions').select('type, amount_satang, account_id, to_account_id'),
      supabase
        .from('transactions')
        .select('type, amount_satang, category, datetime')
        .gte('datetime', monthStart)
        .lte('datetime', monthEnd),
      supabase
        .from('transactions')
        .select('type, amount_satang, datetime')
        .in('type', ['income', 'expense'])
        .gte('datetime', chartStart.toISOString())
        .lte('datetime', monthEnd),
    ]),
  ])

  const chartSeries: MonthlyPoint[] = Array.from({ length: 6 }, (_, i) => {
    const month = format(subMonths(now, 5 - i), 'yyyy-MM')
    return { month, income: 0, expense: 0 }
  })
  const byMonth = new Map(chartSeries.map((p) => [p.month, p]))
  for (const tx of chartTx ?? []) {
    const point = byMonth.get(format(new Date(tx.datetime), 'yyyy-MM'))
    if (!point) continue
    if (tx.type === 'income') point.income += tx.amount_satang
    else point.expense += tx.amount_satang
  }

  const monthExpenses = (monthTx ?? []).filter((t) => t.type === 'expense') as ExpenseRow[]
  const budgetItems = ((budgets ?? []) as BudgetRow[])
    .map((budget) => ({ budget, status: budgetStatus(budget, monthExpenses, now) }))
    .sort((a) => (a.budget.scope === 'overall' ? -1 : 1))
    .slice(0, 3)

  const totalBalance = (accounts ?? []).reduce(
    (sum, acct) =>
      sum +
      computeAccountBalance(
        (allTx ?? []) as Parameters<typeof computeAccountBalance>[0],
        acct.id,
        acct.opening_balance_satang ?? 0,
      ),
    0,
  )

  const monthIncome = (monthTx ?? [])
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount_satang, 0)

  const monthExpense = (monthTx ?? [])
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount_satang, 0)

  return (
    <div className="space-y-6">
      {/* Hero — total balance as the focal point: elevated gradient card + deadpan
          mascot watching over the money (design 07 rev 2026-06-30: Calm-Elevated). */}
      <div className="bg-hero relative isolate overflow-hidden rounded-2xl px-5 py-5 text-white shadow-float">
        <Mascot
          expr="deadpan"
          className="pointer-events-none absolute -right-2 -top-3 -z-10 h-28 w-28 opacity-90"
        />
        <p className="text-sm font-medium text-white/80">{t('totalBalance')}</p>
        <HeroBalance
          satang={totalBalance}
          className="mt-1 block text-[2.15rem] font-bold leading-tight tabular-nums"
        />
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
          <span>
            <span className="text-white/70">{t('monthIncome')} </span>
            <span className="font-semibold">+{formatTHB(monthIncome)}</span>
          </span>
          <span>
            <span className="text-white/70">{t('monthExpense')} </span>
            <span className="font-semibold">-{formatTHB(monthExpense)}</span>
          </span>
        </div>
      </div>

      {/* Quick-add: amount + type + scan/save; the rest expands in the sheet. */}
      <QuickAddCard />

      {/* Mobile quick-access — desktop has the full sidebar instead. */}
      <div className="md:hidden">
        <DashboardShortcuts />
      </div>

      {/* Account balances */}
      {(accounts ?? []).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">{t('accounts')}</h2>
            <Link href="/accounts" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              {t('viewAll')} <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y rounded-xl border bg-card shadow-soft">
            {(accounts ?? []).map((acct) => {
              const bal = computeAccountBalance(
                (allTx ?? []) as Parameters<typeof computeAccountBalance>[0],
                acct.id,
                acct.opening_balance_satang ?? 0,
              )
              return (
                <div key={acct.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{acct.name}</p>
                    <Badge variant="secondary" className="text-xs mt-0.5">{acct.bank}</Badge>
                  </div>
                  <p className={`text-sm font-semibold tabular-nums ${bal < 0 ? 'text-destructive' : ''}`}>
                    {formatTHB(bal)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Budgets summary */}
      {budgetItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">{t('budgets')}</h2>
            <Link href="/budgets" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              {t('viewAll')} <ArrowRight className="size-3" />
            </Link>
          </div>
          <Card>
            <CardContent className="space-y-4 py-4">
              {budgetItems.map(({ budget, status }) => (
                <BudgetBar key={budget.id} budget={budget} status={status} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Income vs expense — last 6 months (Recharts, lazy client chunk) */}
      <div>
        <h2 className="mb-3 font-semibold">{t('chart6m')}</h2>
        <Card>
          <CardContent className="pt-4">
            <LazyIncomeExpenseChart data={chartSeries} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
