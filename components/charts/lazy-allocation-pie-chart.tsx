'use client'

import dynamic from 'next/dynamic'
import type { AllocationSlice } from './allocation-pie-chart'

// Keeps Recharts out of the server bundle and every non-/invest route; loads
// as a separate client chunk only when the Overview tab (M3) actually renders
// (same pattern as components/charts/lazy-income-expense-chart.tsx).
const AllocationPieChart = dynamic(() => import('./allocation-pie-chart'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-muted" />,
})

export default function LazyAllocationPieChart({ data }: { data: AllocationSlice[] }) {
  return <AllocationPieChart data={data} />
}
