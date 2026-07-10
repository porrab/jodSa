'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CategoryLabel } from '@/lib/categories'
import { Plus } from 'lucide-react'
import { Mascot } from '@/components/mascot'
import { format } from 'date-fns'
import { th, enUS } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import TransactionForm from '@/components/transaction-form'
import TransactionDetailSheet from '@/components/transaction-detail-sheet'
import { formatTHB } from '@/lib/money'
import type { LastAccountMap } from '@/lib/last-account'
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
  lastByCategory,
  globalLastAccountId,
}: {
  transactions: Transaction[]
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
}) {
  const t = useTranslations('transaction')
  const locale = useLocale()
  const dateLocale = locale === 'th' ? th : enUS
  const [addOpen, setAddOpen] = useState(false)
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  // Bangkok calendar-day key (YYYY-MM-DD) — groups the list by the day the money
  // actually moved, not the viewer's UTC day.
  const bangkokDayKey = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const todayKey = bangkokDayKey(new Date().toISOString())
  const yesterdayKey = bangkokDayKey(new Date(Date.now() - 86_400_000).toISOString())

  function dayLabel(key: string, sampleIso: string): string {
    if (key === todayKey) return t('today')
    if (key === yesterdayKey) return t('yesterday')
    return format(new Date(sampleIso), 'EEE d MMM yyyy', { locale: dateLocale })
  }

  // Transactions arrive already sorted datetime-desc, so walking them keeps each
  // day's rows contiguous — collect them into ordered day groups.
  const groups: { key: string; label: string; items: Transaction[] }[] = []
  for (const tx of transactions) {
    const key = bangkokDayKey(tx.datetime)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(tx)
    else groups.push({ key, label: dayLabel(key, tx.datetime), items: [tx] })
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
            lastByCategory={lastByCategory}
            globalLastAccountId={globalLastAccountId}
            onSuccess={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {transactions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <Mascot expr="sleepy" className="mx-auto mb-3 h-20 w-20 opacity-80" />
          <p>{t('noTransactions')}</p>
          <p className="text-sm mt-1">{t('addFirst')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              {/* Day header — sticks under the top bar while its rows scroll. */}
              <div className="sticky top-0 z-10 -mx-1 mb-1.5 bg-background/85 px-1 py-1 backdrop-blur">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h2>
              </div>
              <div className="rounded-lg border divide-y">
                {group.items.map((tx) => {
                  const acct = accountMap[tx.account_id]
                  const toAcct = tx.to_account_id ? accountMap[tx.to_account_id] : null
                  const style = TYPE_STYLE[tx.type] ?? TYPE_STYLE.expense

                  return (
                    // J3: row tap opens the detail sheet — no inline destructive icon
                    // (today's per-row trash button invites misfires; delete now lives
                    // inside the sheet, separated from the primary edit action).
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => setDetailTx(tx)}
                      className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                            style.badgeCls,
                          )}>
                            {t(style.key)}
                          </span>
                          {tx.category && (
                            <span className="text-xs text-muted-foreground"><CategoryLabel value={tx.category} /></span>
                          )}
                          {tx.recurring_rule_id && (
                            <span className="text-xs" title={t('recurringBadge')} aria-label={t('recurringBadge')}>
                              🔁
                            </span>
                          )}
                        </div>
                        <p className="text-sm mt-0.5 truncate">
                          {tx.counterparty ?? (toAcct ? `→ ${toAcct.name}` : acct?.name ?? '—')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(tx.datetime), 'HH:mm', { locale: dateLocale })}
                          {acct && <> · {acct.name}</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('font-semibold tabular-nums text-sm', style.textCls)}>
                          {style.prefix}{formatTHB(tx.amount_satang)}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <TransactionDetailSheet
        tx={detailTx}
        accounts={accounts}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
        open={detailTx !== null}
        onOpenChange={(o) => { if (!o) setDetailTx(null) }}
      />
    </div>
  )
}
