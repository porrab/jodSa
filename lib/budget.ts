// [M3] Budget vs. actual. Budgets track expense ONLY — transfers and income are
// excluded (the caller passes type='expense' rows). Period is the current Bangkok
// day or month; scope is overall (all expense) or a single category.

export type BudgetRow = {
  id: string
  period: 'day' | 'month'
  scope: 'overall' | 'category'
  category: string | null
  amount_satang: number
}

export type ExpenseRow = {
  amount_satang: number
  category: string | null
  datetime: string // ISO timestamptz
}

function bangkokDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** Total expense (satang) counting toward `budget` for the current period. */
export function spentForBudget(
  budget: BudgetRow,
  expenses: ExpenseRow[],
  now: Date = new Date(),
): number {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) // YYYY-MM-DD
  const month = today.slice(0, 7) // YYYY-MM
  let sum = 0
  for (const e of expenses) {
    if (budget.scope === 'category' && e.category !== budget.category) continue
    const d = bangkokDate(e.datetime)
    const inPeriod = budget.period === 'day' ? d === today : d.slice(0, 7) === month
    if (inPeriod) sum += e.amount_satang
  }
  return sum
}

export type BudgetStatus = {
  spent: number
  remaining: number // budget − spent (negative = over)
  ratio: number // spent / budget, clamped to [0, 1] for the bar fill
  over: boolean
}

export function budgetStatus(
  budget: BudgetRow,
  expenses: ExpenseRow[],
  now: Date = new Date(),
): BudgetStatus {
  const spent = spentForBudget(budget, expenses, now)
  const remaining = budget.amount_satang - spent
  const ratio = budget.amount_satang > 0 ? Math.min(1, spent / budget.amount_satang) : 0
  return { spent, remaining, ratio, over: remaining < 0 }
}
