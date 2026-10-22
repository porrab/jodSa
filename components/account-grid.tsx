'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/supabase/types'

type Account = Pick<Database['public']['Tables']['accounts']['Row'], 'id' | 'name' | 'bank'>

export default function AccountGrid({
  accounts,
  value,
  onValueChange,
  balances,
  balancesLoading,
  label,
  disabledAccountId,
}: {
  accounts: Account[]
  value: string
  onValueChange: (id: string) => void
  balances: Record<string, number>
  balancesLoading: boolean
  label: string
  disabledAccountId?: string
}) {
  const t = useTranslations('transaction')
  const locale = useLocale()
  const [expanded, setExpanded] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([])
  const visibleAccounts = accounts.length > 9 && !expanded ? accounts.slice(0, 8) : accounts
  const selectedIndex = visibleAccounts.findIndex((account) => account.id === value)
  const focusedIndex = visibleAccounts.findIndex((account) => account.id === focusId)
  const rovingIndex = focusedIndex >= 0 ? focusedIndex : selectedIndex >= 0 ? selectedIndex : 0

  const fullMoney = useMemo(() => new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', {
    style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }), [locale])
  const tileMoney = useMemo(() => new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', {
    style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }), [locale])

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const columns = window.matchMedia('(min-width: 768px)').matches ? 4 : 3
    const delta = event.key === 'ArrowRight' ? 1
      : event.key === 'ArrowLeft' ? -1
        : event.key === 'ArrowDown' ? columns
          : event.key === 'ArrowUp' ? -columns
            : 0
    if (delta === 0) return
    event.preventDefault()
    const next = Math.max(0, Math.min(visibleAccounts.length - 1, index + delta))
    setFocusId(visibleAccounts[next].id)
    tileRefs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2 md:grid-cols-4">
      {visibleAccounts.map((account, index) => {
        const selected = account.id === value
        const dimmed = account.id === disabledAccountId
        const balance = balances[account.id]
        const balanceLabel = balancesLoading
          ? t('accountBalanceLoading')
          : balance === undefined
            ? t('accountBalanceUnavailable')
            : t('accountBalanceA11y', { amount: fullMoney.format(balance / 100) })
        const ariaLabel = `${account.name}, ${account.bank}, ${balanceLabel}${dimmed ? `, ${t('sameAccountDisabled')}` : ''}`

        return (
          <button
            key={account.id}
            ref={(node) => { tileRefs.current[index] = node }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={dimmed}
            aria-label={ariaLabel}
            tabIndex={index === rovingIndex ? 0 : -1}
            onFocus={() => setFocusId(account.id)}
            onKeyDown={(event) => moveFocus(event, index)}
            onClick={() => { if (!dimmed) onValueChange(account.id) }}
            className={cn(
              'relative h-[72px] min-w-0 rounded-md border bg-card px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey-edge',
              selected
                ? 'border-2 border-honey-edge bg-primary text-primary-foreground'
                : balance === 0
                  ? 'border-transparent bg-background text-muted-foreground hover:bg-secondary'
                  : 'border-border hover:bg-secondary',
              dimmed && 'opacity-40',
            )}
          >
            <span className="flex items-start justify-between gap-1">
              <span className="truncate text-sm font-semibold">{account.name}</span>
              {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-primary-foreground" />}
            </span>
            {balancesLoading ? (
              <span aria-hidden="true" className="mt-1 block h-4 w-14 animate-pulse rounded bg-muted" />
            ) : (
              <span className={cn('mt-1 block truncate text-sm tabular-nums', selected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {balance === undefined ? '—' : tileMoney.format(balance / 100)}
              </span>
            )}
          </button>
        )
      })}

      {accounts.length > 9 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex h-[72px] items-center justify-center gap-1 rounded-md border border-dashed border-muted-foreground bg-card px-2 py-2 text-sm font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey-edge"
        >
          {t('showAllAccounts', { count: accounts.length })}<ChevronDown aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  )
}
