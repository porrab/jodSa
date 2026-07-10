'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { th, enUS } from 'date-fns/locale'
import { toast } from 'sonner'
import { CategoryLabel } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import TransactionForm from '@/components/transaction-form'
import { deleteTransaction } from '@/app/actions/transactions'
import { skipOccurrence } from '@/app/actions/recurring'
import { formatTHB } from '@/lib/money'
import type { LastAccountMap } from '@/lib/last-account'
import type { Database } from '@/lib/supabase/types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

const TYPE_STRIPE: Record<string, string> = {
  income: 'border-l-income',
  expense: 'border-l-expense',
  transfer: 'border-l-transfer',
}

const TYPE_TEXT: Record<string, string> = {
  income: 'text-income',
  expense: 'text-expense',
  transfer: 'text-transfer',
}

/**
 * J3 — row tap opens this detail sheet. Delete lives *inside* it (destructive,
 * separated from the primary แก้ไข action), never as an inline per-row icon.
 * Everything is editable except ref_code (dedup identity, M7-A) — the edit form
 * simply has no field for it.
 */
export default function TransactionDetailSheet({
  tx,
  accounts,
  lastByCategory,
  globalLastAccountId,
  open,
  onOpenChange,
}: {
  tx: Transaction | null
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('transaction')
  const locale = useLocale()
  const dateLocale = locale === 'th' ? th : enUS
  const [editing, setEditing] = useState(false)

  function close() {
    setEditing(false)
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!tx) return
    const isOccurrence = tx.recurring_rule_id != null && tx.occurrence_date != null
    const msg = isOccurrence ? t('skipOccurrenceConfirm') : t('deleteConfirm')
    if (!confirm(msg)) return
    try {
      if (isOccurrence) {
        await skipOccurrence(tx.recurring_rule_id!, tx.occurrence_date!, tx.id)
      } else {
        await deleteTransaction(tx.id)
      }
      toast.success(isOccurrence ? t('occurrenceSkipped') : t('deleted'))
      close()
    } catch {
      toast.error(t('actionFailed'))
    }
  }

  if (!tx) return null

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const acct = accountMap[tx.account_id]
  const toAcct = tx.to_account_id ? accountMap[tx.to_account_id] : null
  const prefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <SheetContent side="bottom" className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
        </SheetHeader>

        {editing ? (
          <div className="px-4 pb-6">
            <TransactionForm
              editId={tx.id}
              accounts={accounts}
              lastByCategory={lastByCategory}
              globalLastAccountId={globalLastAccountId}
              onSuccess={close}
              defaultValues={{
                type: tx.type as 'income' | 'expense' | 'transfer',
                amount: (tx.amount_satang / 100).toFixed(2),
                account_id: tx.account_id,
                to_account_id: tx.to_account_id ?? undefined,
                category: tx.category ?? undefined,
                counterparty: tx.counterparty ?? undefined,
                datetime: format(new Date(tx.datetime), "yyyy-MM-dd'T'HH:mm"),
              }}
            />
          </div>
        ) : (
          <div className={cn('space-y-3 border-l-4 px-4 pb-6', TYPE_STRIPE[tx.type])}>
            <p className={cn('text-2xl font-bold tabular-nums', TYPE_TEXT[tx.type])}>
              {prefix}{formatTHB(tx.amount_satang)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{t(tx.type)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {tx.category && <><CategoryLabel value={tx.category} /> · </>}
              {toAcct ? `${acct?.name ?? '—'} → ${toAcct.name}` : acct?.name ?? '—'}
            </p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(tx.datetime), 'd MMM yyyy · HH:mm', { locale: dateLocale })}
              {tx.counterparty && <> · {tx.counterparty}</>}
            </p>
            {tx.ref_code && (
              <p className="truncate font-mono text-xs text-muted-foreground">
                {t('refCode', { code: tx.ref_code })}
              </p>
            )}
            {tx.recurring_rule_id && (
              <p className="text-xs text-muted-foreground">🔁 {t('recurringBadge')}</p>
            )}

            <Button className="w-full" onClick={() => setEditing(true)}>
              {t('edit')}
            </Button>
            <button
              type="button"
              onClick={handleDelete}
              className="block w-full pt-1 text-left text-sm text-destructive hover:underline"
            >
              {t('deleteAction')}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
