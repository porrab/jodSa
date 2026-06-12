import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import { budgetStatus, type BudgetRow, type ExpenseRow } from '@/lib/budget'
import { formatTHB, computeAccountBalance } from '@/lib/money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import BudgetBar from '@/components/budget-bar'
import { startOfMonth, endOfMonth } from 'date-fns'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const now = new Date()
  const monthStart = startOfMonth(now).toISOString()
  const monthEnd = endOfMonth(now).toISOString()

  // Lazy-on-read: materialize due recurring occurrences for this month first.
  const { from: matFrom, to: matTo } = currentMonthRange(now)
  await materializeOccurrences(matFrom, matTo)

  const [{ data: accounts }, { data: allTx }, { data: monthTx }, { data: budgets }] =
    await Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('transactions').select('type, amount_satang, account_id, to_account_id'),
      supabase
        .from('transactions')
        .select('type, amount_satang, category, datetime')
        .gte('datetime', monthStart)
        .lte('datetime', monthEnd),
      supabase.from('budgets').select('*'),
    ])

  const monthExpenses = (monthTx ?? []).filter((t) => t.type === 'expense') as ExpenseRow[]
  const budgetItems = ((budgets ?? []) as BudgetRow[])
    .map((budget) => ({ budget, status: budgetStatus(budget, monthExpenses, now) }))
    .sort((a, b) => (a.budget.scope === 'overall' ? -1 : 1))
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
      <h1 className="text-2xl font-bold">ภาพรวม</h1>

      {/* Net balance */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">ยอดรวมทุกบัญชี</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-3xl font-bold tabular-nums ${totalBalance < 0 ? 'text-destructive' : ''}`}>
            {formatTHB(totalBalance)}
          </p>
        </CardContent>
      </Card>

      {/* This month summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">รายรับเดือนนี้</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-income">
              +{formatTHB(monthIncome)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">รายจ่ายเดือนนี้</CardTitle>
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
            <h2 className="font-semibold">บัญชี</h2>
            <Link href="/accounts" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              ดูทั้งหมด <ArrowRight className="size-3" />
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
            <h2 className="font-semibold">งบประมาณ</h2>
            <Link href="/budgets" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              ดูทั้งหมด <ArrowRight className="size-3" />
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

      {/* M5: Recharts charts here */}
    </div>
  )
}
