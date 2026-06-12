'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatTHB } from '@/lib/money'

export type MonthlyPoint = { month: string; income: number; expense: number }

export default function IncomeExpenseChart({ data }: { data: MonthlyPoint[] }) {
  const t = useTranslations('dashboard')
  const locale = useLocale()
  const intl = locale === 'th' ? 'th-TH' : 'en-GB'

  const rows = data.map((d) => ({
    ...d,
    label: new Date(`${d.month}-01T00:00:00`).toLocaleDateString(intl, { month: 'short' }),
    incomeBaht: d.income / 100,
    expenseBaht: d.expense / 100,
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--popover-foreground)',
              fontSize: 12,
            }}
            formatter={(value, name) => [
              formatTHB(Math.round((value as number) * 100)),
              name === 'incomeBaht' ? t('chartIncome') : t('chartExpense'),
            ]}
          />
          <Legend
            formatter={(value) => (value === 'incomeBaht' ? t('chartIncome') : t('chartExpense'))}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="incomeBaht" fill="var(--income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenseBaht" fill="var(--expense)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
