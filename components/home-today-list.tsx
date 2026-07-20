'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { th, enUS } from 'date-fns/locale'
import { CategoryLabel } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { formatTHB } from '@/lib/money'
import TransactionDetailSheet from '@/components/transaction-detail-sheet'
import { usePendingTx } from '@/components/pending-tx-provider'
import { Mascot } from '@/components/mascot'
import type { LastAccountMap } from '@/lib/last-account'
import type { Database } from '@/lib/supabase/types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

const TYPE_TEXT: Record<string, string> = {
  income: 'text-income',
  expense: 'text-expense',
  transfer: 'text-transfer',
}

/**
 * Home's "รายการวันนี้" list (design v3 — Home shows today only, no chart).
 * Single-line rows (density budget: amount right, tabular, one meta max);
 * tap opens the same J3 detail sheet as the full รายการ page.
 */
export default function HomeTodayList({
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
  const t = useTranslations('dashboard')
  const locale = useLocale()
  const dateLocale = locale === 'th' ? th : enUS
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const { pending } = usePendingTx()

  return (
    <div className="space-y-2">
      {/* Section heading, not a caption (design v4 F3): Home's ladder ran
          36px → 14px with nothing between, and four different ranks all shared
          `muted-foreground`. A heading is `foreground` at the 16px base tier;
          `muted-foreground` + 14px is reserved for genuinely secondary text. */}
      <h2 className="text-base font-semibold">
        {t('todayTransactions', { count: transactions.length + pending.length })}
      </h2>

      {transactions.length === 0 && pending.length === 0 ? (
        /* Empty state carries the mascot (design v4 F4). v3 bans the mascot from
           Home's hero because Home is J1 and J1 is speed — but an empty list is
           the one place on this screen with nothing to be fast about, so it is
           where warmth costs the user nothing. `shrug`, never a celebratory
           expression: the brand rule is that the mascot never applauds. */
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <Mascot expr="shrug" className="size-16 opacity-80" />
          <p className="text-sm text-muted-foreground">{t('noTransactionsToday')}</p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {/* Provisional rows (design v4 F6). Subdued and NOT tappable — there is
              no saved record to open a detail sheet for yet. Deliberately no
              spinner and no motion: the brief calls for a visual pending state,
              and `prefers-reduced-motion` users must get the same affordance. */}
          {pending.map((p) => (
            <div
              key={p.tempId}
              className="flex w-full min-h-14 items-center gap-3 px-3 py-2.5 text-left opacity-60"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-base">
                  {p.label}
                  {p.category && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      <CategoryLabel value={p.category} />
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{t('pendingSave')}</p>
              </div>
              <span className={cn('shrink-0 text-base font-semibold tabular-nums', TYPE_TEXT[p.type])}>
                {p.type === 'income' ? '+' : p.type === 'expense' ? '-' : ''}
                {formatTHB(p.amountSatang)}
              </span>
            </div>
          ))}

          {transactions.map((tx) => {
            const acct = accountMap[tx.account_id]
            const toAcct = tx.to_account_id ? accountMap[tx.to_account_id] : null
            const prefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''
            const label =
              tx.counterparty ?? (toAcct ? `→ ${toAcct.name}` : (acct?.name ?? '—'))

            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => setDetailTx(tx)}
                className="flex w-full min-h-14 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  {/* Primary row content sits at the 16px base tier (design v4
                      F3); the category chip and timestamp are the secondary
                      rank and keep muted + small. */}
                  <p className="truncate text-base">
                    {label}
                    {tx.category && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        <CategoryLabel value={tx.category} />
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(tx.datetime), 'HH:mm', { locale: dateLocale })}
                  </p>
                </div>
                <span className={cn('shrink-0 text-base font-semibold tabular-nums', TYPE_TEXT[tx.type])}>
                  {prefix}{formatTHB(tx.amount_satang)}
                </span>
              </button>
            )
          })}
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
