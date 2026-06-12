import { createClient } from '@/lib/supabase/server'
import { budgetStatus, type BudgetRow, type ExpenseRow } from '@/lib/budget'
import BudgetsClient, { type BudgetItem } from './budgets-client'

export default async function BudgetsPage() {
  const supabase = await createClient()

  // This month's expenses cover both month- and day-period budgets (day ⊂ month).
  const now = new Date()
  const month = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
  const monthStart = `${month}-01T00:00:00+07:00`

  const [{ data: budgets }, { data: expenses }] = await Promise.all([
    supabase.from('budgets').select('*'),
    supabase
      .from('transactions')
      .select('amount_satang, category, datetime')
      .eq('type', 'expense')
      .gte('datetime', monthStart),
  ])

  const expenseRows = (expenses ?? []) as ExpenseRow[]
  const items: BudgetItem[] = ((budgets ?? []) as BudgetRow[])
    .map((budget) => ({ budget, status: budgetStatus(budget, expenseRows, now) }))
    // overall first, then by largest budget
    .sort((a, b) => {
      if (a.budget.scope !== b.budget.scope) return a.budget.scope === 'overall' ? -1 : 1
      return b.budget.amount_satang - a.budget.amount_satang
    })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">งบประมาณ</h1>
        <p className="text-sm text-muted-foreground">ยอดใช้จริงเทียบกับงบ (เฉพาะรายจ่าย)</p>
      </div>
      <BudgetsClient items={items} />
    </div>
  )
}
