'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { th, enUS } from 'date-fns/locale'
import { CategoryLabel } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { formatTHB } from '@/lib/money'
import TransactionDetailSheet from '@/components/transaction-detail-sheet'
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

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">
        {t('todayTransactions', { count: transactions.length })}
      </h2>

      {transactions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t('noTransactionsToday')}
        </p>
      ) : (
        <div className="rounded-lg border divide-y">
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
                  <p className="truncate text-sm">
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
                <span className={cn('shrink-0 text-sm font-semibold tabular-nums', TYPE_TEXT[tx.type])}>
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
