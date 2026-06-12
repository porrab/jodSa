'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { th, enUS } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import TransactionForm from '@/components/transaction-form'
import { deleteTransaction } from '@/app/actions/transactions'
import { skipOccurrence } from '@/app/actions/recurring'
import { formatTHB } from '@/lib/money'
import type { Database } from '@/lib/supabase/types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

const TYPE_STYLE: Record<string, { key: string; badgeCls: string; textCls: string; prefix: string }> = {
  income:   { key: 'income',   badgeCls: 'border-income/30 bg-income/10 text-income',       textCls: 'text-income',   prefix: '+' },
  expense:  { key: 'expense',  badgeCls: 'border-expense/30 bg-expense/10 text-expense',    textCls: 'text-expense',  prefix: '-' },
  transfer: { key: 'transfer', badgeCls: 'border-transfer/30 bg-transfer/10 text-transfer', textCls: 'text-transfer', prefix: '' },
}

export default function TransactionsClient({
  transactions,
  accounts,
}: {
  transactions: Transaction[]
  accounts: Account[]
}) {
  const t = useTranslations('transaction')
  const locale = useLocale()
  const dateLocale = locale === 'th' ? th : enUS
  const [addOpen, setAddOpen] = useState(false)
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  async function handleDelete(tx: Transaction) {
    // A materialized recurring occurrence must be skipped (delete + exception
    // row), or the lazy-on-read materializer will recreate it on next load.
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
    } catch {
      toast.error(t('actionFailed'))
    }
  }

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button><Plus className="size-4 mr-2" />{t('add')}</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('add')}</DialogTitle></DialogHeader>
          <TransactionForm
            accounts={accounts}
            onSuccess={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {transactions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>{t('noTransactions')}</p>
          <p className="text-sm mt-1">{t('addFirst')}</p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {transactions.map((tx) => {
            const acct = accountMap[tx.account_id]
            const toAcct = tx.to_account_id ? accountMap[tx.to_account_id] : null
            const style = TYPE_STYLE[tx.type] ?? TYPE_STYLE.expense

            return (
              <div key={tx.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                      style.badgeCls,
                    )}>
                      {t(style.key)}
                    </span>
                    {tx.category && (
                      <span className="text-xs text-muted-foreground">{tx.category}</span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5 truncate">
                    {tx.counterparty ?? (toAcct ? `→ ${toAcct.name}` : acct?.name ?? '—')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(tx.datetime), 'd MMM yyyy HH:mm', { locale: dateLocale })}
                    {acct && <> · {acct.name}</>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('font-semibold tabular-nums text-sm', style.textCls)}>
                    {style.prefix}{formatTHB(tx.amount_satang)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(tx)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
