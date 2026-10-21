import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'

const TYPE_ICON: Record<string, LucideIcon> = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  transfer: ArrowLeftRight,
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

  return <Icon aria-hidden="true" className="mr-1 size-3.5 shrink-0" />
}
