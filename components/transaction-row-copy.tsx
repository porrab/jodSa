'use client'

import type { ReactNode } from 'react'
import { CategoryLabel } from '@/lib/categories'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/supabase/types'

type Transaction = Pick<
  Database['public']['Tables']['transactions']['Row'],
  'type' | 'counterparty' | 'category'
>

/**
 * Shared Tx Row copy rule from design v6:
 *   title = display name ?? payee ?? category
 *   meta  = time · account · category · payee, omitting category/payee when used as title
 *
 * `displayName` is intentionally optional until A3 adds its persisted field.
 * Transfer rows have no category, so their destination remains the title while
 * the source account appears exactly once in meta.
 */
export default function TransactionRowCopy({
  tx,
  accountName,
  toAccountName,
  time,
  displayName,
  testId,
  titleClassName,
  metaClassName,
}: {
  tx: Transaction
  accountName?: string | null
  toAccountName?: string | null
  time: string
  displayName?: string | null
  testId?: string
  titleClassName?: string
  metaClassName?: string
}) {
  const explicitName = displayName?.trim() || null
  const payee = tx.counterparty?.trim() || null
  const payeeIsTitle = !explicitName && !!payee
  const categoryIsTitle = !explicitName && !payee && tx.type !== 'transfer' && !!tx.category
  const showCategory = !!tx.category && !categoryIsTitle
  const showPayee = !!payee && !payeeIsTitle && payee !== explicitName

  let title: ReactNode = '—'
  if (explicitName) title = explicitName
  else if (payee) title = payee
  else if (tx.type === 'transfer' && toAccountName) title = `→ ${toAccountName}`
  else if (tx.category) title = <CategoryLabel value={tx.category} />

  return (
    <div data-testid={testId} className="min-w-0 flex-1">
      <p data-testid={testId ? `${testId}-title` : undefined} className={cn('truncate text-base', titleClassName)}>
        {title}
      </p>
      <p data-testid={testId ? `${testId}-meta` : undefined} className={cn('truncate whitespace-nowrap text-sm text-muted-foreground', metaClassName)}>
        {time}
        {accountName && <> · {accountName}</>}
        {showCategory && <> · <CategoryLabel value={tx.category} /></>}
        {showPayee && <> · {payee}</>}
      </p>
    </div>
  )
}
