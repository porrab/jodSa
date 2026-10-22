import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Scale,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

const TYPE_ICON: Record<string, LucideIcon> = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  transfer: ArrowLeftRight,
  invest: TrendingUp,
  divest: TrendingDown,
  adjustment: Scale,
}

export const TRANSACTION_TYPE_STYLE: Record<string, { text: string; border: string; soft: string }> = {
  income: { text: 'text-income', border: 'border-income', soft: 'bg-success-soft' },
  expense: { text: 'text-expense', border: 'border-expense', soft: 'bg-blush' },
  transfer: { text: 'text-transfer', border: 'border-transfer', soft: 'bg-info-soft' },
  invest: { text: 'text-transfer', border: 'border-transfer', soft: 'bg-info-soft' },
  divest: { text: 'text-transfer', border: 'border-transfer', soft: 'bg-info-soft' },
  adjustment: { text: 'text-warn', border: 'border-warn', soft: 'bg-warn-soft' },
}

export function transactionAmountPrefix(type: string): string {
  if (type === 'income') return '+'
  if (type === 'expense') return '−'
  if (type === 'transfer') return '⇄'
  return ''
}

export function TransactionTypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON[type]
  if (!Icon) return null

  return <Icon aria-hidden="true" className="size-4 shrink-0" />
}

export function TransactionTypeBadge({ type, label }: { type: string; label: string }) {
  const style = TRANSACTION_TYPE_STYLE[type] ?? TRANSACTION_TYPE_STYLE.expense
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border ${style.border} ${style.text}`}
    >
      <TransactionTypeIcon type={type} />
    </span>
  )
}
