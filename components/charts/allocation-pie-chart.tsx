'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--muted-foreground)',
]

export type AllocationSlice = { label: string; value: number; pct: number }

/** M3 dashboard allocation chart (asset class / currency / sleeve) — lazy-loaded, see lazy-allocation-pie-chart.tsx. */
export default function AllocationPieChart({ data }: { data: AllocationSlice[] }) {
  if (data.length === 0) {
    return null
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={80} paddingAngle={2}>
            {data.map((entry, i) => (
              <Cell key={entry.label} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--popover-foreground)',
              fontSize: 12,
            }}
            formatter={(_value, _name, item) => {
              const slice = item?.payload as AllocationSlice | undefined
              return [`${slice?.pct.toFixed(1) ?? '0'}%`, slice?.label ?? '']
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
