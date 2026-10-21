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

  function show(next: 'top' | 'cash' | 'invest') { setTarget(next); setOpen(true) }

  return (
    <div className="space-y-1">
      <button type="button" onClick={() => show('top')} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-sm text-muted-foreground">{includesInvestments ? t('moneyTotalLabel') : t('cashTotalLabel')}</span>
          <span className="text-focal block text-4xl font-bold leading-tight tabular-nums">
            {includesInvestments && '≈ '}{formatMoney(totalMinor, 'THB', locale)}
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      {holdings.length > 0 || investmentsFailed ? (
        <div className="space-y-0.5 pt-1">
          <button type="button" onClick={() => show('cash')} className="flex min-h-11 w-full items-center gap-2 text-left text-base">
            <span aria-hidden="true">├</span><span className="flex-1">{t('cashInAccounts')}</span><span className="tabular-nums">{formatTHB(cashTotal)}</span>
          </button>
          <button type="button" onClick={() => show('invest')} className="flex min-h-11 w-full items-center gap-2 text-left text-base">
            <span aria-hidden="true">└</span><span className="flex-1">📈 {t('investments')}</span>
            <span className="text-right tabular-nums">
              {investmentsFailed ? t('investmentsLoadFailed') : valued.length === 0 ? t('valueMissing') : <>≈ {formatMoney(investMinor, 'THB', locale)}{latestLabel && <> · {t('updated', { date: latestLabel })}</>}{stale && <> · {t('staleValue')}</>}{missing > 0 && <> · {t('missingValues', { count: missing })}</>}</>}
            </span>
          </button>
        </div>
      ) : null}

      <BalanceBreakdownSheet open={open} onOpenChange={setOpen} target={target} cashTotal={cashTotal} investmentTotal={investmentTotal} accounts={accounts} holdings={holdings} />
    </div>
  )
}
