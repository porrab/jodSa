'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight, TrendingUp } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatTHB } from '@/lib/money'
import { formatMoney } from '@/lib/invest/money'

export type HomeAccountBalance = { id: string; name: string; bank: string; balance: number }
export type HomeHoldingValue = {
  id: string
  name: string
  symbol: string | null
  broker: string | null
  valueMinor: string | null
  updatedAt: string
}

export default function BalanceBreakdownSheet({
  open,
  onOpenChange,
  target,
  cashTotal,
  investmentTotal,
  accounts,
  holdings,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: 'top' | 'cash' | 'invest'
  cashTotal: number
  investmentTotal: string
  accounts: HomeAccountBalance[]
  holdings: HomeHoldingValue[]
}) {
  const t = useTranslations('dashboard')
  const locale = useLocale()
  const investMinor = BigInt(investmentTotal)
  const totalMinor = BigInt(cashTotal) + investMinor

  useEffect(() => {
    if (!open || target === 'top') return
    requestAnimationFrame(() => document.getElementById(`money-${target}`)?.scrollIntoView({ block: 'start' }))
  }, [open, target])

  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok',
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>{t('moneyTotalTitle')}</SheetTitle></SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <p className="text-sm text-muted-foreground">{t('moneyTotalLabel')}</p>
          <p className="text-4xl font-bold leading-[1.7] tabular-nums">≈ {formatMoney(totalMinor, 'THB', locale)}</p>

          <section id="money-cash" className="scroll-mt-4 space-y-2">
            <div className="flex items-baseline justify-between gap-3 font-semibold">
              <h3>{t('cashInAccounts')}</h3><span className="tabular-nums">{formatTHB(cashTotal)}</span>
            </div>
            <div className="divide-y divide-border">
              {accounts.map((account) => (
                <Link key={account.id} href={`/accounts?account=${account.id}`} className="flex min-h-12 items-center gap-2 px-3 py-2 hover:bg-accent/40">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{account.name}</p><p className="text-sm text-muted-foreground">{account.bank}</p></div>
                  <span className="text-sm tabular-nums">{formatTHB(account.balance)}</span><ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{t('cashFormula')}</p>
          </section>

          {holdings.length > 0 && (
            <section id="money-invest" className="scroll-mt-4 space-y-2">
              <div className="flex items-baseline justify-between gap-3 font-semibold">
                <h3 className="inline-flex items-center gap-1.5"><TrendingUp className="size-4" />{t('investmentsManual')}</h3><span className="tabular-nums">≈ {formatMoney(investMinor, 'THB', locale)}</span>
              </div>
              <div className="divide-y divide-border">
                {holdings.map((holding) => (
                  <Link key={holding.id} href={`/invest?holding=${holding.id}`} className="flex min-h-12 items-center gap-2 px-3 py-2 hover:bg-accent/40">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{holding.symbol ?? holding.name}</p><p className="text-sm text-muted-foreground">{holding.broker ?? '—'}</p></div>
                    <span className="text-right text-sm tabular-nums">
                      {holding.valueMinor === null ? t('valueMissing') : <>≈ {formatMoney(holding.valueMinor, 'THB', locale)} · {dateLabel(holding.updatedAt)}</>}
                    </span><ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
