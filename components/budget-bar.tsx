import { formatTHB } from '@/lib/money'
import { PERIOD_LABELS } from '@/lib/validators/budget'
import type { BudgetRow, BudgetStatus } from '@/lib/budget'

export default function BudgetBar({
  budget,
  status,
}: {
  budget: BudgetRow
  status: BudgetStatus
}) {
  const label =
    budget.scope === 'overall' ? 'ทั้งหมด' : (budget.category ?? 'ไม่ระบุหมวด')

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {label}
          <span className="ml-1.5 text-xs text-muted-foreground">
            {PERIOD_LABELS[budget.period]}
          </span>
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatTHB(status.spent)} / {formatTHB(budget.amount_satang)}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            status.over ? 'bg-destructive' : 'bg-primary'
          }`}
          style={{ width: `${status.ratio * 100}%` }}
        />
      </div>

      <p className={`text-xs tabular-nums ${status.over ? 'text-destructive' : 'text-muted-foreground'}`}>
        {status.over
          ? `เกินงบ ${formatTHB(-status.remaining)}`
          : `เหลือ ${formatTHB(status.remaining)}`}
      </p>
    </div>
  )
}
