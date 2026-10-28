'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { th, enUS } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import TransactionForm from '@/components/transaction-form'
import { deleteTransaction } from '@/app/actions/transactions'
import { skipOccurrence } from '@/app/actions/recurring'
import { formatTHB } from '@/lib/money'
import {
  TransactionTypeIcon,
  transactionAmountPrefix,
} from '@/components/transaction-type-indicator'
import TransactionRowCopy from '@/components/transaction-row-copy'
import { CategoryLabel } from '@/lib/categories'
import { formatAppDateTime } from '@/lib/date-display'
import type { LastAccountMap } from '@/lib/last-account'
import type { Database } from '@/lib/supabase/types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

const TYPE_TEXT: Record<string, string> = {
  income: 'text-income',
  expense: 'text-expense',
  transfer: 'text-transfer',
  invest: 'text-transfer',
  divest: 'text-transfer',
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
  holdingSymbol,
}: {
  tx: Transaction | null
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  holdingSymbol?: string | null
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
  const shownName = tx.note?.trim()
    ? tx.note
    : tx.counterparty?.trim()
      ? tx.counterparty
      : tx.type === 'transfer' && toAcct
        ? `→ ${toAcct.name}`
        : tx.type === 'invest' || tx.type === 'divest'
          ? `${tx.type === 'invest' ? '→' : '←'} พอร์ตลงทุน${holdingSymbol ? ` · ${holdingSymbol}` : ''}`
        : tx.category
          ? <CategoryLabel value={tx.category} />
          : '—'

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <SheetContent side="bottom" className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{shownName}</SheetTitle>
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
                type: tx.type,
                amount: (tx.amount_satang / 100).toFixed(2),
                account_id: tx.account_id,
                to_account_id: tx.to_account_id ?? undefined,
                holding_id: tx.holding_id ?? undefined,
                category: tx.category ?? undefined,
                counterparty: tx.counterparty ?? undefined,
                note: tx.note ?? undefined,
                datetime: format(new Date(tx.datetime), "yyyy-MM-dd'T'HH:mm"),
              }}
            />
          </div>
        ) : (
          <div className="space-y-5 px-4 pb-6">
            <div className="border-b border-border pb-3 text-center">
              <p className="text-sm text-muted-foreground">{t(tx.type)}{tx.category && <> · <CategoryLabel value={tx.category} /></>}</p>
              <p className={cn('text-4xl font-bold leading-[1.35] tabular-nums', TYPE_TEXT[tx.type])}>
                {transactionAmountPrefix(tx.type)}{formatTHB(tx.amount_satang)}
              </p>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {tx.note && <DetailField label={t('shownNameLabel')} value={tx.note} />}
              {tx.counterparty && <DetailField label={tx.type === 'income' ? t('payerLabel') : t('payeeLabel')} value={tx.counterparty} />}
              <DetailField label={t('account')} value={tx.type === 'transfer' && toAcct ? `${acct?.name ?? '—'} → ${toAcct.name}` : tx.type === 'invest' ? `${acct?.name ?? '—'} → ${t('portfolioTile')}` : tx.type === 'divest' ? `${t('portfolioTile')} → ${acct?.name ?? '—'}` : acct?.name ?? '—'} />
              <DetailField label={t('dateTimeLabel')} value={formatAppDateTime(tx.datetime, locale === 'th' ? 'th' : 'en')} />
              <DetailField label={t('groupLabel')} value={tx.group_id ? t('groupAssigned') : '—'} />
              <DetailField label={t('sourceLabel')} value={tx.recurring_rule_id ? t('sourceRecurring') : tx.ref_code ? t('sourceSlip') : t('sourceManual')} />
            </div>
            <div className="sr-only">
              <TransactionRowCopy tx={tx} accountName={acct?.name} toAccountName={toAcct?.name} holdingSymbol={holdingSymbol} time={format(new Date(tx.datetime), 'HH:mm', { locale: dateLocale })} testId="transaction-detail-copy" />
            </div>

            <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
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

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
