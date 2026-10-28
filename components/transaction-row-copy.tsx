'use client'

import type { ReactNode } from 'react'
import { CategoryLabel } from '@/lib/categories'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/supabase/types'

type Transaction = Pick<
  Database['public']['Tables']['transactions']['Row'],
  'type' | 'counterparty' | 'category' | 'note'
>

export function resolveTransactionRowCopy({
  tx,
  toAccountName,
  displayName,
  holdingSymbol,
}: {
  tx: Transaction
  toAccountName?: string | null
  displayName?: string | null
  holdingSymbol?: string | null
}) {
  const explicitName = displayName?.trim() || tx.note?.trim() || null
  const payee = tx.counterparty?.trim() || null
  const payeeIsTitle = !explicitName && !!payee
  const categoryIsTitle = !explicitName && !payee && tx.type !== 'transfer' && !!tx.category

  return {
    explicitName,
    payee,
    categoryIsTitle,
    showCategory: !!tx.category && !categoryIsTitle,
    showPayee: !!payee && !payeeIsTitle && payee !== explicitName,
    textTitle: explicitName || payee ||
      (tx.type === 'invest' ? `→ พอร์ตลงทุน${holdingSymbol ? ` · ${holdingSymbol}` : ''}` :
        tx.type === 'divest' ? `← พอร์ตลงทุน${holdingSymbol ? ` · ${holdingSymbol}` : ''}` :
          tx.type === 'transfer' && toAccountName ? `→ ${toAccountName}` : null),
  }
}

/**
 * Shared Tx Row copy rule from design v6:
 *   title = display name ?? payee ?? category
 *   meta  = time · account · category · payee, omitting category/payee when used as title
 *
 * Transfer rows have no category, so their destination remains the title while
 * the source account appears exactly once in meta.
 */
export default function TransactionRowCopy({
  tx,
  accountName,
  toAccountName,
  time,
  displayName,
  holdingSymbol,
  testId,
  titleClassName,
  metaClassName,
}: {
  tx: Transaction
  accountName?: string | null
  toAccountName?: string | null
  time: string
  displayName?: string | null
  holdingSymbol?: string | null
  testId?: string
  titleClassName?: string
  metaClassName?: string
}) {
  const { payee, categoryIsTitle, showCategory, showPayee, textTitle } = resolveTransactionRowCopy({
    tx,
    toAccountName,
    displayName,
    holdingSymbol,
  })

  let title: ReactNode = '—'
  if (textTitle) title = textTitle
  else if (categoryIsTitle && tx.category) title = <CategoryLabel value={tx.category} />

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
