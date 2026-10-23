'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatTHB } from '@/lib/money'
import { formatMoney } from '@/lib/invest/money'
import BalanceBreakdownSheet, { type HomeAccountBalance, type HomeHoldingValue } from '@/components/balance-breakdown-sheet'

export default function HomeMoneyHeader({
  cashTotal,
  investmentTotal,
  accounts,
  holdings,
  investmentsFailed,
}: {
  cashTotal: number
  investmentTotal: string
  accounts: HomeAccountBalance[]
  holdings: HomeHoldingValue[]
  investmentsFailed: boolean
}) {
  const t = useTranslations('dashboard')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<'top' | 'cash' | 'invest'>('top')
  const investMinor = BigInt(investmentTotal)
  const valued = holdings.filter((holding) => holding.valueMinor !== null)
  const missing = holdings.length - valued.length
  const includesInvestments = !investmentsFailed && valued.length > 0
  const totalMinor = BigInt(cashTotal) + (includesInvestments ? investMinor : 0n)
  const latest = valued.reduce<string | null>((max, holding) => !max || holding.updatedAt > max ? holding.updatedAt : max, null)
  const latestLabel = latest ? new Date(latest).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok',
  }) : null
  const stale = latest ? Date.now() - new Date(latest).getTime() > 30 * 86_400_000 : false
  const positiveCash = Math.max(0, cashTotal)
  const positiveInvest = includesInvestments ? Number(investMinor > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : investMinor) : 0
  const splitTotal = positiveCash + Math.max(0, positiveInvest)
  const cashShare = splitTotal > 0 ? positiveCash / splitTotal * 100 : 100

  function show(next: 'top' | 'cash' | 'invest') { setTarget(next); setOpen(true) }

  return (
    <div className="flex h-full flex-col rounded-[20px] bg-hero p-5 text-hero-foreground shadow-soft">
      <button type="button" onClick={() => show('top')} className="flex min-h-[76px] w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-sm text-hero-muted">{includesInvestments ? t('moneyTotalLabel') : t('cashTotalLabel')}</span>
          <span className="block text-4xl font-bold leading-tight text-hero-figure tabular-nums">
            {includesInvestments && '≈ '}{formatMoney(totalMinor, 'THB', locale)}
          </span>
        </span>
        <ChevronRight className="size-4 text-hero-muted" />
      </button>

      {holdings.length > 0 || investmentsFailed ? (
        <div className="flex flex-1 flex-col pt-2">
          <div aria-hidden="true" className="mb-1 flex h-2 shrink-0 overflow-hidden rounded-full bg-hero-inset">
            <span className="h-full border-r border-hero bg-primary" style={{ width: `${cashShare}%` }} />
            <span className="h-full flex-1 bg-invest-bar" />
          </div>
          <button type="button" onClick={() => show('cash')} className="flex min-h-14 w-full flex-1 items-center gap-3 border-b border-hero-inset text-left text-base">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-hero-figure" />
            <span className="min-w-0 flex-1">
              <span className="block">{t('cashInAccounts')}</span>
              <span className="block text-sm text-hero-muted">{t('accountsCount', { count: accounts.length })}</span>
            </span>
            <span className="shrink-0 tabular-nums">{formatTHB(cashTotal)}</span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-hero-muted" />
          </button>
          <button type="button" onClick={() => show('invest')} className="flex min-h-14 w-full flex-1 items-center gap-3 text-left text-base">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-invest-bar" />
            <span className="min-w-0 flex-1">
              <span className="block">{t('investments')}</span>
              <span className="block truncate text-sm text-hero-muted">
                {investmentsFailed ? t('investmentsLoadFailed') : latestLabel ? t('updated', { date: latestLabel }) : valued.length === 0 ? t('valueMissing') : null}
                {stale && <> · {t('staleValue')}</>}{missing > 0 && <> · {t('missingValues', { count: missing })}</>}
              </span>
            </span>
            <span className="shrink-0 text-right tabular-nums">{valued.length === 0 ? '—' : <>≈ {formatMoney(investMinor, 'THB', locale)}</>}</span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-hero-muted" />
          </button>
        </div>
      ) : null}

      <BalanceBreakdownSheet open={open} onOpenChange={setOpen} target={target} cashTotal={cashTotal} investmentTotal={investmentTotal} accounts={accounts} holdings={holdings} />
    </div>
  )
}
