'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import BudgetsClient, { type BudgetItem } from './budgets-client'
import LazyIncomeExpenseChart from '@/components/charts/lazy-income-expense-chart'
import type { MonthlyPoint } from '@/components/charts/income-expense-chart'

/**
 * J6 — budget bars first; charts move here as a second "ภาพรวม" segment,
 * lazy-loaded and never on Home. The chart chunk (Recharts) only mounts once
 * this segment is actually opened, so a first visit to งบ never pays for it.
 */
export default function BudgetsOverviewTabs({
  items,
  chartSeries,
}: {
  items: BudgetItem[]
  chartSeries: MonthlyPoint[]
}) {
  const t = useTranslations('budget')
  const td = useTranslations('dashboard')
  const [tab, setTab] = useState<'budgets' | 'overview'>('budgets')

  return (
    <div className="space-y-4">
      <div className="flex border-b border-border">
        {(['budgets', 'overview'] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              'min-h-11 border-b-[3px] px-4 py-2 text-sm transition-colors',
              tab === tb ? 'border-honey-edge font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tb === 'budgets' ? t('tabBudgets') : t('tabOverview')}
          </button>
        ))}
      </div>

      {tab === 'budgets' ? (
        <BudgetsClient items={items} />
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="font-semibold">{td('chart6m')}</h2>
            <LazyIncomeExpenseChart data={chartSeries} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
