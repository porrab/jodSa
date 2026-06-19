import { useTranslations } from 'next-intl'
import { formatTHB } from '@/lib/money'
import type { BudgetRow, BudgetStatus } from '@/lib/budget'

export default function BudgetBar({
  budget,
  status,
}: {
  budget: BudgetRow
  status: BudgetStatus
}) {
  const t = useTranslations('budget')
  const label =
    budget.scope === 'overall' ? t('scopeOverall') : (budget.category ?? t('noCategory'))

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {label}
          <span className="ml-1.5 text-xs text-muted-foreground">
            {budget.period === 'month' ? t('periodMonth') : t('periodDay')}
          </span>
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatTHB(status.spent)} / {formatTHB(budget.amount_satang)}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            status.over ? 'bg-expense' : 'bg-primary'
          }`}
          style={{ width: `${status.ratio * 100}%` }}
        />
      </div>

      <p className={`text-xs tabular-nums ${status.over ? 'text-expense' : 'text-muted-foreground'}`}>
        {status.over
          ? t('overBy', { amount: formatTHB(-status.remaining) })
          : t('remaining', { amount: formatTHB(status.remaining) })}
      </p>
    </div>
  )
}
