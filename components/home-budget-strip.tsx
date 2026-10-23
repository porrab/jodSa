'use client'

import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CategoryLabel } from '@/lib/categories'
import { formatTHB } from '@/lib/money'
import type { BudgetRow, BudgetStatus } from '@/lib/budget'

function formatWholeTHB(satang: number): string {
  return `฿${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(satang / 100))}`
}

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
      <Link href="/budgets" className="flex h-full min-h-14 items-center justify-between gap-3 bg-secondary px-4 py-3 text-sm text-foreground">
        <span>{t('noBudgetLine', { amount: formatTHB(monthExpense) })}</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-honey-text" />
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
      className={`block h-full space-y-2 transition-colors ${status.over ? '-mx-5 -my-4 bg-blush px-5 py-4' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{title}</span>
        <span className="inline-flex items-center gap-1 font-normal text-muted-foreground">
          {t('daysRemaining', { days: daysRemaining })}
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <p className={`text-base font-semibold tabular-nums ${status.over ? 'text-expense' : 'text-foreground'}`}>
          {status.over
            ? <span className="inline-flex items-center gap-1.5"><AlertTriangle aria-hidden="true" className="size-4" />{t('homeBudgetOver', { amount: formatWholeTHB(-status.remaining) })}</span>
            : t('homeBudgetRemainingShort', { remaining: formatWholeTHB(status.remaining) })}
        </p>
        <p className="text-sm text-muted-foreground">{t('fromBudget', { amount: formatWholeTHB(budget.amount_satang) })}</p>
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
            status.over ? 'bg-destructive' : 'border-[1.5px] border-honey-edge bg-primary'
          }`}
          style={{ transform: `scaleX(${status.ratio})` }}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {t('spentThisMonth', { amount: formatWholeTHB(status.spent) })}
        {!status.over && dailyAllowance > 0 && <> · {t('dailyAllowance', { amount: formatWholeTHB(dailyAllowance) })}</>}
        {status.over && <> · {t('daysRemaining', { days: daysRemaining })}</>}
      </p>
    </Link>
  )
}
