'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CategoryLabel } from '@/lib/categories'
import { formatTHB } from '@/lib/money'
import type { BudgetRow, BudgetStatus } from '@/lib/budget'

export default function HomeBudgetStrip({
  budget,
  status,
  monthExpense,
  daysRemaining,
}: {
  budget: BudgetRow | null
  status: BudgetStatus | null
  monthExpense: number
  daysRemaining: number
}) {
  const t = useTranslations('dashboard')

  if (!budget || !status) {
    return (
      <Link href="/budgets" className="block text-sm text-muted-foreground hover:text-foreground">
        {t('noBudgetLine', { amount: formatTHB(monthExpense) })}
      </Link>
    )
  }

  const dailyAllowance = status.remaining > 0 && daysRemaining > 0
    ? Math.round(status.remaining / daysRemaining / 100) * 100
    : 0
  const title = budget.scope === 'overall' ? (
    t('homeBudget')
  ) : (
    <>{t('categoryBudget')} <CategoryLabel value={budget.category ?? ''} /></>
  )

  return (
    <Link
      href="/budgets"
      className="block space-y-2 rounded-lg border bg-card p-4 shadow-xs transition-colors hover:bg-accent/30"
    >
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{title}</span>
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={`text-base font-semibold tabular-nums ${status.over ? 'text-expense' : 'text-foreground'}`}>
          {status.over
            ? t('homeBudgetOver', { amount: formatTHB(-status.remaining) })
            : t('homeBudgetRemaining', {
                remaining: formatTHB(status.remaining),
                amount: formatTHB(budget.amount_satang),
              })}
        </p>
        <p className="text-sm text-muted-foreground">{t('daysRemaining', { days: daysRemaining })}</p>
      </div>

      <div
        role="progressbar"
        aria-label={t('budgetProgress', {
          spent: formatTHB(status.spent),
          amount: formatTHB(budget.amount_satang),
        })}
        aria-valuemin={0}
        aria-valuemax={budget.amount_satang}
        aria-valuenow={Math.min(status.spent, budget.amount_satang)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full w-full origin-left rounded-full transition-transform motion-reduce:transition-none ${
            status.over ? 'bg-expense' : 'bg-muted-foreground'
          }`}
          style={{ transform: `scaleX(${status.ratio})` }}
        />
      </div>

      {!status.over && dailyAllowance > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('dailyAllowance', { amount: formatTHB(dailyAllowance) })}
        </p>
      )}
    </Link>
  )
}
