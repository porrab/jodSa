import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import { budgetStatus, type BudgetRow, type ExpenseRow } from '@/lib/budget'
import { formatTHB, computeAccountBalance } from '@/lib/money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import BudgetBar from '@/components/budget-bar'
import QuickAddCard from '@/components/quick-add-card'
import DashboardShortcuts from '@/components/dashboard-shortcuts'
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
      {/* Greeting + net balance — one-line summary above the quick-add (design 07 rev 2026-06-15) */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className={`text-sm text-muted-foreground tabular-nums ${totalBalance < 0 ? 'text-destructive' : ''}`}>
          {t('totalBalance')}: <span className="font-semibold">{formatTHB(totalBalance)}</span>
        </p>
      </div>

      {/* Quick-add: amount + type + scan/save; the rest expands in the sheet. */}
      <QuickAddCard />

      {/* Mobile quick-access — desktop has the full sidebar instead. */}
      <div className="md:hidden">
        <DashboardShortcuts />
      </div>

      {/* This month summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('monthIncome')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-income">
              +{formatTHB(monthIncome)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('monthExpense')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-expense">
              -{formatTHB(monthExpense)}
            </p>
          </CardContent>
        </Card>
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
          <div className="rounded-lg border divide-y">
            {(accounts ?? []).map((acct) => {
              const bal = computeAccountBalance(
                (allTx ?? []) as Parameters<typeof computeAccountBalance>[0],
                acct.id,
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
