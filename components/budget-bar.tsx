import { useTranslations } from 'next-intl'
import { formatTHB } from '@/lib/money'
import { AlertTriangle } from 'lucide-react'
import { CategoryLabel } from '@/lib/categories'
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
    budget.scope === 'overall' ? (
      t('scopeOverall')
    ) : budget.category ? (
      <CategoryLabel value={budget.category} />
    ) : (
      t('noCategory')
    )

  return (
    <div className={`space-y-2 rounded-md p-3 ${status.over ? 'bg-blush' : 'bg-card'}`}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {label}
          <span className="ml-1.5 text-sm text-muted-foreground">
            {budget.period === 'month' ? t('periodMonth') : t('periodDay')}
          </span>
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatTHB(status.spent)} / {formatTHB(budget.amount_satang)}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full w-full origin-left rounded-full transition-transform motion-reduce:transition-none ${
            status.over ? 'bg-destructive' : 'border-[1.5px] border-honey-edge bg-primary'
          }`}
          style={{ transform: `scaleX(${Math.min(status.ratio, 1)})` }}
        />
      </div>

      <p className={`flex items-center gap-1.5 text-sm tabular-nums ${status.over ? 'text-destructive' : 'text-muted-foreground'}`}>
        {status.over ? (
          <>
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            {t('overBy', { amount: formatTHB(-status.remaining) })}
          </>
        ) : (
          t('remaining', { amount: formatTHB(status.remaining) })
        )}
      </p>
    </div>
  )
}
