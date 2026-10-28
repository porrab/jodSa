'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
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
import TransactionRowCopy from '@/components/transaction-row-copy'
import { PageHeader } from '@/components/ui/page-header'
import { formatAppDayHeading } from '@/lib/date-display'
import { formatAppDate } from '@/lib/date-display'
import type { TransactionDateGap } from '@/lib/reconcile'
import BackfillGapSheet from '@/components/backfill-gap-sheet'
import { dayExpenseTotal } from '@/lib/transaction-totals'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

const TYPE_KEY: Record<string, string> = { income: 'income', expense: 'expense', transfer: 'transfer', invest: 'invest', divest: 'divest' }

type Group = { id: string; title: string }

export default function TransactionsClient({
  transactions,
  holdingSymbols,
  lastDayMayBePartial,
  accounts,
  groups = [],
  dateGaps,
  lastByCategory,
  globalLastAccountId,
}: {
  transactions: Transaction[]
  holdingSymbols: Record<string, string>
  lastDayMayBePartial: boolean
  accounts: Account[]
  groups?: Group[]
  dateGaps: TransactionDateGap[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
}) {
  const t = useTranslations('transaction')
  const locale = useLocale()
  const dateLocale = locale === 'th' ? th : enUS
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const [gapDate, setGapDate] = useState<string | null>(null)
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
    const date = formatAppDayHeading(sampleIso, locale === 'th' ? 'th' : 'en')
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
      last.expenseTotal += dayExpenseTotal([tx])
    } else {
      dayGroups.push({
        key,
        label: dayLabel(key, tx.datetime),
        items: [tx],
        expenseTotal: dayExpenseTotal([tx]),
      })
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        action={<Button size="sm" onClick={() => openQuickAdd()}><Plus className="size-4" />{t('addShort')}</Button>}
      />

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

      {activeGroup === null && dateGaps.map((gap) => {
        const dateLocale = locale === 'th' ? 'th' : 'en'
        const from = formatAppDate(`${gap.from}T12:00:00+07:00`, { locale: dateLocale, includeYear: false })
        const to = formatAppDate(`${gap.to}T12:00:00+07:00`, { locale: dateLocale, includeYear: false })
        const label = gap.from === gap.to
          ? t('gapHintSingle', { date: from })
          : t('gapHintRange', { from, to })
        return (
          <div key={`${gap.from}-${gap.to}`} className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2.5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setGapDate(gap.from)}>
              {t('backfill')}
            </Button>
          </div>
        )
      })}

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
                      data-testid={`transaction-${tx.id}`}
                      type="button"
                      onClick={() => setDetailTx(tx)}
                      className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/50"
                    >
                      <TransactionTypeBadge type={tx.type} label={t(typeKey)} />
                      <div className="min-w-0 flex-1">
                        <TransactionRowCopy
                          tx={tx}
                          holdingSymbol={tx.holding_id ? holdingSymbols[tx.holding_id] : null}
                          accountName={acct?.name}
                          toAccountName={toAcct?.name}
                          time={format(new Date(tx.datetime), 'HH:mm', { locale: dateLocale })}
                          testId={`transaction-${tx.id}-copy`}
                        />
                        {tx.recurring_rule_id && (
                          <span className="text-sm" title={t('recurringBadge')} aria-label={t('recurringBadge')}>
                            🔁
                          </span>
                        )}
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
        holdingSymbol={detailTx?.holding_id ? holdingSymbols[detailTx.holding_id] : null}
        accounts={accounts}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
        open={detailTx !== null}
        onOpenChange={(o) => { if (!o) setDetailTx(null) }}
      />
      <BackfillGapSheet
        open={gapDate !== null}
        presetDate={gapDate ?? dateGaps[0]?.from ?? todayKey}
        accounts={accounts}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
        onOpenChange={(open) => { if (!open) setGapDate(null) }}
      />
    </div>
  )
}
