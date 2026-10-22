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
import TransactionDetailSheet from '@/components/transaction-detail-sheet'
import { formatTHB } from '@/lib/money'
import { TransactionTypeBadge, TRANSACTION_TYPE_STYLE, transactionAmountPrefix } from '@/components/transaction-type-indicator'
import { Chip } from '@/components/ui/chip'
import type { LastAccountMap } from '@/lib/last-account'
import type { Database } from '@/lib/supabase/types'
import { openQuickAdd } from '@/lib/quick-add'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

const TYPE_KEY: Record<string, string> = { income: 'income', expense: 'expense', transfer: 'transfer' }

type Group = { id: string; title: string }

export default function TransactionsClient({
  transactions,
  lastDayMayBePartial,
  accounts,
  groups = [],
  lastByCategory,
  globalLastAccountId,
}: {
  transactions: Transaction[]
  lastDayMayBePartial: boolean
  accounts: Account[]
  groups?: Group[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
}) {
  const t = useTranslations('transaction')
  const locale = useLocale()
  const dateLocale = locale === 'th' ? th : enUS
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  // M3 "groups" left the nav in the design v3 reset (J5) — existing grouped
  // data stays reachable as a filter chip here instead of its own nav item.
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const filteredTransactions = activeGroup
    ? transactions.filter((tx) => tx.group_id === activeGroup)
    : transactions

  // Bangkok calendar-day key (YYYY-MM-DD) — groups the list by the day the money
  // actually moved, not the viewer's UTC day.
  const bangkokDayKey = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const todayKey = bangkokDayKey(new Date().toISOString())
  const yesterdayKey = bangkokDayKey(new Date(Date.now() - 86_400_000).toISOString())

  function dayLabel(key: string, sampleIso: string): string {
    const date = format(new Date(sampleIso), 'EEE d MMM yyyy', { locale: dateLocale })
    if (key === todayKey) return `${t('today')} · ${date}`
    if (key === yesterdayKey) return `${t('yesterday')} · ${date}`
    return date
  }

  // Transactions arrive already sorted datetime-desc, so walking them keeps each
  // day's rows contiguous — collect them into ordered day groups.
  const dayGroups: { key: string; label: string; items: Transaction[]; expenseTotal: number }[] = []
  for (const tx of filteredTransactions) {
    const key = bangkokDayKey(tx.datetime)
    const last = dayGroups[dayGroups.length - 1]
    if (last && last.key === key) {
      last.items.push(tx)
      if (tx.type === 'expense') last.expenseTotal += tx.amount_satang
    } else {
      dayGroups.push({
        key,
        label: dayLabel(key, tx.datetime),
        items: [tx],
        expenseTotal: tx.type === 'expense' ? tx.amount_satang : 0,
      })
    }
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => openQuickAdd()}><Plus className="size-4 mr-2" />{t('add')}</Button>

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip pressed={activeGroup === null} onClick={() => setActiveGroup(null)}>
            {t('filterAll')}
          </Chip>
          {groups.map((g) => (
            <Chip
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              pressed={activeGroup === g.id}
            >
              {g.title}
            </Chip>
          ))}
        </div>
      )}

      {filteredTransactions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <Mascot expr="sleepy" className="mx-auto mb-3 h-20 w-20 opacity-80" />
          <p>{t('noTransactions')}</p>
          <p className="text-sm mt-1">{t('addFirst')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dayGroups.map((group, groupIndex) => (
            <div key={group.key}>
              {/* Day header — sticks under the top bar while its rows scroll.
                  Flat bg (no blur-behind-text — design v3 anti-pattern). */}
              <div className="sticky top-0 z-10 -mx-1 mb-1.5 flex items-center justify-between gap-3 bg-background px-1 py-1">
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                {group.expenseTotal > 0 && !(lastDayMayBePartial && groupIndex === dayGroups.length - 1) && (
                  <p className="shrink-0 text-sm text-muted-foreground">
                    {t('dailySpent', { amount: formatTHB(group.expenseTotal) })}
                  </p>
                )}
              </div>
              <div className="divide-y divide-border">
                {group.items.map((tx) => {
                  const acct = accountMap[tx.account_id]
                  const toAcct = tx.to_account_id ? accountMap[tx.to_account_id] : null
                  const style = TRANSACTION_TYPE_STYLE[tx.type] ?? TRANSACTION_TYPE_STYLE.expense
                  const typeKey = TYPE_KEY[tx.type] ?? 'expense'

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
                      <TransactionTypeBadge type={tx.type} label={t(typeKey)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {tx.category && (
                            <span className="text-sm text-muted-foreground"><CategoryLabel value={tx.category} /></span>
                          )}
                          {tx.recurring_rule_id && (
                            <span className="text-sm" title={t('recurringBadge')} aria-label={t('recurringBadge')}>
                              🔁
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-base">
                          {tx.counterparty ?? (toAcct ? `→ ${toAcct.name}` : acct?.name ?? '—')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(tx.datetime), 'HH:mm', { locale: dateLocale })}
                          {acct && <> · {acct.name}</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('text-base font-semibold tabular-nums', style.text)}>
                          {transactionAmountPrefix(tx.type)}{formatTHB(tx.amount_satang)}
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
