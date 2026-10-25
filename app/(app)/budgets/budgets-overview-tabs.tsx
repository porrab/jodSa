'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PageTabs, PageTab } from '@/components/ui/page-tabs'
import { Card, CardContent } from '@/components/ui/card'
import BudgetsClient, { type BudgetItem } from './budgets-client'
import LazyIncomeExpenseChart from '@/components/charts/lazy-income-expense-chart'
import type { MonthlyPoint } from '@/components/charts/income-expense-chart'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

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
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={<Button size="sm" onClick={() => window.dispatchEvent(new Event('jodsa:budget-add'))}><Plus className="size-4" />{t('addShort')}</Button>}
      />
      <PageTabs className="grid-cols-2">
        {(['budgets', 'overview'] as const).map((tb) => (
          <PageTab
            key={tb}
            onClick={() => setTab(tb)}
            active={tab === tb}
          >
            {tb === 'budgets' ? t('tabBudgets') : t('tabOverview')}
          </PageTab>
        ))}
      </PageTabs>

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
