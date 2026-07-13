import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { budgetStatus, type BudgetRow, type ExpenseRow } from '@/lib/budget'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import BudgetsOverviewTabs from './budgets-overview-tabs'
import type { MonthlyPoint } from '@/components/charts/income-expense-chart'
import type { BudgetItem } from './budgets-client'

export default async function BudgetsPage() {
  const t = await getTranslations('budget')
  const supabase = await createClient()

  // This month's expenses cover both month- and day-period budgets (day ⊂ month).
  const now = new Date()
  const month = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
  const monthStart = `${month}-01T00:00:00+07:00`

  // ภาพรวม segment (J6): income/expense — last 6 months. Moved off Home per
  // design v3; stays a lazy client chunk (Recharts never ships in the Home
  // route bundle) and only mounts once the user opens this segment.
  const chartStart = startOfMonth(subMonths(now, 5))
  const monthEnd = endOfMonth(now).toISOString()

  const [{ data: budgets }, { data: expenses }, { data: sixMoTx }] = await Promise.all([
    supabase.from('budgets').select('*'),
    supabase
      .from('transactions')
      .select('amount_satang, category, datetime')
      .eq('type', 'expense')
      .gte('datetime', monthStart),
    supabase
      .from('transactions')
      .select('type, amount_satang, datetime')
      .in('type', ['income', 'expense'])
      .gte('datetime', chartStart.toISOString())
      .lte('datetime', monthEnd),
  ])

  const expenseRows = (expenses ?? []) as ExpenseRow[]
  const items: BudgetItem[] = ((budgets ?? []) as BudgetRow[])
    .map((budget) => ({ budget, status: budgetStatus(budget, expenseRows, now) }))
    // overall first, then by largest budget
    .sort((a, b) => {
      if (a.budget.scope !== b.budget.scope) return a.budget.scope === 'overall' ? -1 : 1
      return b.budget.amount_satang - a.budget.amount_satang
    })

  const chartSeries: MonthlyPoint[] = Array.from({ length: 6 }, (_, i) => {
    const m = format(subMonths(now, 5 - i), 'yyyy-MM')
    return { month: m, income: 0, expense: 0 }
  })
  const byMonth = new Map(chartSeries.map((p) => [p.month, p]))
  for (const tx of sixMoTx ?? []) {
    const point = byMonth.get(format(new Date(tx.datetime), 'yyyy-MM'))
    if (!point) continue
    if (tx.type === 'income') point.income += tx.amount_satang
    else point.expense += tx.amount_satang
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <BudgetsOverviewTabs items={items} chartSeries={chartSeries} />
    </div>
  )
}
