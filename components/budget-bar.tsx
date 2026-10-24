import { useTranslations } from 'next-intl'
import { formatTHB } from '@/lib/money'
import { AlertTriangle } from 'lucide-react'
import { CategoryLabel } from '@/lib/categories'
import type { BudgetRow, BudgetStatus } from '@/lib/budget'

function wholeTHB(satang: number): string {
  return `฿${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(satang / 100))}`
}

export default function BudgetBar({
  budget,
  status,
}: {
  budget: BudgetRow
  status: BudgetStatus
}) {
  const t = useTranslations('budget')
  const td = useTranslations('dashboard')
  const label =
    budget.scope === 'overall' ? (
      t('scopeOverall')
    ) : budget.category ? (
      <CategoryLabel value={budget.category} />
    ) : (
      t('noCategory')
    )

  const now = new Date()
  const daysRemaining = budget.period === 'day'
    ? 0
    : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
  const dailyAllowance = status.remaining > 0 && daysRemaining > 0 ? Math.round(status.remaining / daysRemaining / 100) * 100 : 0

  return (
    <div className={`space-y-3 px-1 py-4 ${status.over ? '-mx-4 bg-blush px-5' : ''}`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">
          {t('bandTitle', { period: budget.period === 'month' ? t('periodMonth') : t('periodDay') })} · {label}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {budget.period === 'day' ? t('today') : td('daysRemaining', { days: daysRemaining })} ›
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <p className={`text-xl font-semibold tabular-nums ${status.over ? 'text-destructive' : ''}`}>
          {status.over ? (
            <span className="inline-flex items-center gap-1.5"><AlertTriangle className="size-4" />{t('overBy', { amount: wholeTHB(-status.remaining) })}</span>
          ) : t('remaining', { amount: wholeTHB(status.remaining) })}
        </p>
        <span className="text-sm text-muted-foreground">{t('fromAmount', { amount: wholeTHB(budget.amount_satang) })}</span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full w-full origin-left rounded-full transition-transform motion-reduce:transition-none ${
            status.over ? 'bg-destructive' : 'border-[1.5px] border-honey-edge bg-primary'
          }`}
          style={{ transform: `scaleX(${Math.min(status.ratio, 1)})` }}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {t('spentCaption', { amount: wholeTHB(status.spent) })}
        {budget.period === 'month' && !status.over && dailyAllowance > 0 ? ` · ${td('dailyAllowance', { amount: wholeTHB(dailyAllowance) })}` : ''}
        {status.over && budget.period === 'month' ? ` · ${td('daysRemaining', { days: daysRemaining })}` : ''}
      </p>
    </div>
  )
}
