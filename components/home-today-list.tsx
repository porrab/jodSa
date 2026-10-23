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
import { ArrowDown, Plus } from 'lucide-react'
import { TransactionTypeBadge, transactionAmountPrefix } from '@/components/transaction-type-indicator'
import TransactionRowCopy from '@/components/transaction-row-copy'
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
  const todayExpense = transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount_satang, 0)

  return (
    <div>
      {/* Section heading, not a caption (design v4 F3): Home's ladder ran
          36px → 14px with nothing between, and four different ranks all shared
          `muted-foreground`. A heading is `foreground` at the 16px base tier;
          `muted-foreground` + 14px is reserved for genuinely secondary text. */}
      <h2 className="flex min-h-8 flex-wrap items-baseline justify-between gap-x-1.5 py-1 text-base font-semibold">
        <span>{transactions.length + pending.length === 0
          ? t('todayTransactionsEmpty')
          : t('todayTransactions', { count: transactions.length + pending.length })}</span>
        {todayExpense > 0 && (
          <span className="text-sm font-semibold">
            {t('todaySpent', { amount: formatTHB(todayExpense) })}
          </span>
        )}
      </h2>

      {transactions.length === 0 && pending.length === 0 ? (
        <div className="mt-2 flex min-h-[216px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-5 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-foreground"><Plus aria-hidden="true" className="size-6" /></span>
          <p className="text-base font-semibold">{t('noTransactionsToday')}</p>
          <p className="max-w-[290px] text-sm text-muted-foreground">{t('noTransactionsTodayHint')}</p>
          <ArrowDown data-testid="empty-today-arrow" aria-hidden="true" className="mt-1 size-5 text-muted-foreground" />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {/* Provisional rows (design v4 F6). Subdued and NOT tappable — there is
              no saved record to open a detail sheet for yet. Deliberately no
              spinner and no motion: the brief calls for a visual pending state,
              and `prefers-reduced-motion` users must get the same affordance. */}
          {pending.map((p) => (
            <div
              key={p.tempId}
              className="flex min-h-[76px] w-full items-center gap-3 py-3 text-left opacity-60"
            >
              <TransactionTypeBadge type={p.type} label={p.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base">
                  {p.label}
                  {p.category && (
                    <span className="ml-1.5 text-sm text-muted-foreground">
                      <CategoryLabel value={p.category} />
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{t('pendingSave')}</p>
              </div>
              <span className={cn('shrink-0 text-base font-semibold tabular-nums', TYPE_TEXT[p.type])}>
                {transactionAmountPrefix(p.type)}
                {formatTHB(p.amountSatang)}
              </span>
            </div>
          ))}

          {transactions.map((tx) => {
            const acct = accountMap[tx.account_id]
            const toAcct = tx.to_account_id ? accountMap[tx.to_account_id] : null
            return (
              <button
                key={tx.id}
                data-testid={`home-transaction-${tx.id}`}
                type="button"
                onClick={() => setDetailTx(tx)}
                className="flex min-h-[76px] w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/50"
              >
                <TransactionTypeBadge type={tx.type} label={tx.type} />
                <TransactionRowCopy
                  tx={tx}
                  accountName={acct?.name}
                  toAccountName={toAcct?.name}
                  time={format(new Date(tx.datetime), 'HH:mm', { locale: dateLocale })}
                  testId={`home-transaction-${tx.id}-copy`}
                />
                <span className={cn('shrink-0 text-base font-semibold tabular-nums', TYPE_TEXT[tx.type])}>
                  {transactionAmountPrefix(tx.type)}{formatTHB(tx.amount_satang)}
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
