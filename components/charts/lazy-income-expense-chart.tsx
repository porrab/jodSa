'use client'

import dynamic from 'next/dynamic'
import type { MonthlyPoint } from './income-expense-chart'

// Keeps Recharts out of the server bundle and every non-dashboard route;
// it loads as a separate client chunk only when the dashboard renders.
const IncomeExpenseChart = dynamic(() => import('./income-expense-chart'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-muted" />,
})

export default function LazyIncomeExpenseChart({ data }: { data: MonthlyPoint[] }) {
  return <IncomeExpenseChart data={data} />
}
