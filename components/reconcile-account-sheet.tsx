'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, Check, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import TransactionForm from '@/components/transaction-form'
import { formatTHB } from '@/lib/money'
import { CategoryLabel } from '@/lib/categories'
import { TransactionTypeBadge } from '@/components/transaction-type-indicator'
import { gapProgress, parseBankBalanceToSatang, reconcileGap } from '@/lib/reconcile'
import { getAccountReconcileState, reconcileRemainder } from '@/app/actions/reconcile'
import { formatAppDate } from '@/lib/date-display'
import type { Database } from '@/lib/supabase/types'

type Account = Pick<Database['public']['Tables']['accounts']['Row'], 'id' | 'name' | 'bank'>
type Transaction = Database['public']['Tables']['transactions']['Row']

function bangkokDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function previousMonthEndBangkok() {
  const [year, month] = bangkokDate().split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, 0))
  return date.toISOString().slice(0, 10)
}

function formatBankBalanceInput(value: string): string | null {
  const cleaned = value.replace(/[฿,\s]/g, '')
  if (!/^-?\d*(?:\.\d{0,2})?$/.test(cleaned)) return null
  if (cleaned === '' || cleaned === '-') return cleaned
  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const [whole, decimal] = unsigned.split('.')
  const grouped = (whole || '0').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${cleaned.includes('.') ? `.${decimal ?? ''}` : ''}`
}

export default function ReconcileAccountSheet({
  account,
  accounts,
  recentTransactions,
  open,
  onOpenChange,
}: {
  account: Account & { balance: number; reconciled_at: string | null }
  accounts: Account[]
  recentTransactions: Transaction[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('reconcile')
  const locale = useLocale()
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [bankInput, setBankInput] = useState('')
  const [bankBalance, setBankBalance] = useState<number | null>(null)
  const [liveBalance, setLiveBalance] = useState(account.balance)
  const [startGap, setStartGap] = useState(0)
  const [selectedDate, setSelectedDate] = useState(bangkokDate(-1))
  const [selectedTime, setSelectedTime] = useState('12:00')
  const [remainderDate, setRemainderDate] = useState(bangkokDate())
  const [savedCount, setSavedCount] = useState(0)
  const [savedRows, setSavedRows] = useState<Array<Pick<Transaction, 'id' | 'type' | 'amount_satang' | 'category' | 'counterparty' | 'note' | 'datetime'>>>([])
  const [showRemainder, setShowRemainder] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const savedTransactionIdsRef = useRef<string[]>([])
  const [prefillVersion, setPrefillVersion] = useState(0)
  const [frequentPrefill, setFrequentPrefill] = useState<Partial<{
    type: 'income' | 'expense'
    amount: string
    category: string
    counterparty: string
    note: string
  }>>({})

  const enteredBankBalance = parseBankBalanceToSatang(bankInput)
  const previewGap = enteredBankBalance === null ? null : reconcileGap(liveBalance, enteredBankBalance)
  const currentGap = bankBalance === null ? 0 : reconcileGap(liveBalance, bankBalance)
  const missingType = currentGap >= 0 ? 'expense' : 'income'
  const transferLockedSide = currentGap >= 0 ? 'source' : 'destination'
  const todayDay = Number(bangkokDate().slice(-2))
  const frequentItems = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000
    const grouped = new Map<string, { count: number; tx: Transaction }>()
    for (const tx of recentTransactions) {
      if (tx.account_id !== account.id || !['income', 'expense'].includes(tx.type) || new Date(tx.datetime).getTime() < cutoff) continue
      const key = [tx.type, tx.amount_satang, tx.category, tx.counterparty, tx.note].join('|')
      const item = grouped.get(key)
      if (item) item.count += 1
      else grouped.set(key, { count: 1, tx })
    }
    return [...grouped.values()].filter((item) => item.count >= 3).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [account.id, recentTransactions])

  function close() {
    setStep(1)
    setBankInput('')
    setBankBalance(null)
    setLiveBalance(account.balance)
    setStartGap(0)
    setSavedCount(0)
    setSavedRows([])
    savedTransactionIdsRef.current = []
    setShowRemainder(false)
    setError('')
    onOpenChange(false)
  }

  async function saveRemainder(datetime: string, bankOverride?: number) {
    const targetBankBalance = bankOverride ?? bankBalance
    if (targetBankBalance === null) return
    setBusy(true)
    setError('')
    const result = await reconcileRemainder({
      accountId: account.id,
      bankBalanceSatang: targetBankBalance,
      expectedAppBalanceSatang: liveBalance,
      datetime,
    })
    setBusy(false)
    if (result.status === 'stale') {
      setLiveBalance(result.balanceSatang)
      setStep(2)
      setError(t('stale', { amount: formatTHB(result.balanceSatang) }))
      return
    }
    if (result.status === 'error') {
      setError(result.error)
      return
    }
    setLiveBalance(result.balanceSatang)
    toast.success(currentGap === 0 ? t('matchedToast') : t('adjustedToast'))
    router.refresh()
    close()
  }

  async function begin() {
    if (enteredBankBalance === null || previewGap === null) {
      setError(t('invalidBalance'))
      return
    }
    setError('')
    setBankBalance(enteredBankBalance)
    setStartGap(previewGap)
    if (previewGap === 0) {
      await saveRemainder(new Date().toISOString(), enteredBankBalance)
      return
    }
    setStep(2)
  }

  async function refreshAfterSave(transactionId?: string) {
    const nextSavedTransactionIds = transactionId
      ? [...savedTransactionIdsRef.current, transactionId]
      : savedTransactionIdsRef.current
    savedTransactionIdsRef.current = nextSavedTransactionIds
    const state = await getAccountReconcileState(account.id, nextSavedTransactionIds)
    if (state.error || state.balanceSatang === undefined) {
      setError(state.error || t('refreshFailed'))
      return
    }
    setLiveBalance(state.balanceSatang)
    setSavedRows(state.savedTransactions ?? [])
    setSavedCount(state.savedTransactions?.length ?? nextSavedTransactionIds.length)
    setShowRemainder(true)
    if (bankBalance !== null && state.balanceSatang === bankBalance) {
      await reconcileRemainder({
        accountId: account.id,
        bankBalanceSatang: bankBalance,
        expectedAppBalanceSatang: state.balanceSatang,
        datetime: new Date().toISOString(),
      })
      toast.success(t('completeToast', { count: savedCount + 1 }))
      router.refresh()
      close()
    }
  }

  const lastChecked = account.reconciled_at
    ? new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(account.reconciled_at))
    : null

  return (
    <Sheet open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92svh] max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{step === 1 ? t('title', { account: account.name }) : step === 2 ? t('missingTitle', { account: account.name }) : t('remainderTitle', { account: account.name })}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {step === 1 && <>
            <div className="flex items-center justify-between border-y border-border py-3 text-sm">
              <span className="text-muted-foreground">{t('appBalance')}</span>
              <strong className="tabular-nums">{formatTHB(liveBalance)}</strong>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-balance">{t('bankBalance')} <RequiredMark /></Label>
              <div className="flex min-h-12 items-center rounded-md border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-honey-edge">
                <span className="mr-2 text-lg font-semibold">฿</span>
                <Input id="bank-balance" name="bank-balance" value={bankInput} onChange={(event) => {
                  const formatted = formatBankBalanceInput(event.target.value)
                  if (formatted !== null) setBankInput(formatted)
                }} inputMode="decimal" className="border-0 px-0 text-lg tabular-nums shadow-none focus-visible:ring-0" autoFocus required />
              </div>
            </div>
            {previewGap !== null && <GapWords gap={previewGap} lastChecked={lastChecked} />}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={begin} disabled={busy || enteredBankBalance === null}>
              {busy ? t('saving') : previewGap === 0 ? t('done') : t('recordMissing')}
            </Button>
          </>}

          {step === 2 && bankBalance !== null && <>
            <GapBar startGap={startGap} gap={currentGap} />
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t('date')}</p>
              <div className="flex flex-wrap gap-2">
                <Chip pressed={selectedDate === bangkokDate(-1)} onClick={() => setSelectedDate(bangkokDate(-1))}>{t('yesterday')}</Chip>
                <Chip pressed={selectedDate === bangkokDate(-2)} onClick={() => setSelectedDate(bangkokDate(-2))}>{t('twoDaysAgo')}</Chip>
                <Chip pressed={selectedDate !== bangkokDate(-1) && selectedDate !== bangkokDate(-2)} onClick={() => (document.getElementById('reconcile-datetime-choice') as HTMLInputElement | null)?.showPicker?.()}>{t('chooseDate')}</Chip>
              </div>
              <Input
                id="reconcile-datetime-choice"
                aria-label={t('chooseDateTime')}
                type="datetime-local"
                value={`${selectedDate}T${selectedTime}`}
                onChange={(event) => {
                  const [date, time] = event.target.value.split('T')
                  if (date) setSelectedDate(date)
                  if (time) setSelectedTime(time)
                }}
                className="border-x-0 border-t-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            {frequentItems.length > 0 && <div className="space-y-2">
              <p className="text-sm font-semibold">{t('frequent')}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {frequentItems.map(({ tx }) => <Chip key={`${tx.type}-${tx.amount_satang}-${tx.category}-${tx.counterparty}-${tx.note}`} pressed={false} onClick={() => {
                  setFrequentPrefill({
                    type: tx.type as 'income' | 'expense',
                    amount: (tx.amount_satang / 100).toFixed(2),
                    category: tx.category ?? '',
                    counterparty: tx.counterparty ?? '',
                    note: tx.note ?? '',
                  })
                  setPrefillVersion((value) => value + 1)
                }}>{tx.note || tx.counterparty || <CategoryLabel value={tx.category} />} {formatTHB(tx.amount_satang)}</Chip>)}
              </div>
            </div>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {/* TODO(C2/0012): add invest/divest only after migration 0012 is live. */}
            <TransactionForm
              key={`${selectedDate}-${savedCount}-${prefillVersion}`}
              accounts={accounts}
              lockedAccountId={account.id}
              transferLockedSide={transferLockedSide}
              defaultValues={{ type: missingType, account_id: account.id, datetime: `${selectedDate}T${selectedTime}`, ...frequentPrefill }}
              onSuccess={refreshAfterSave}
              preventDoubleSubmit
              submitLabel={t('saveAndContinue')}
              idPrefix="reconcile"
              hideDatetimeField
            />
            {savedCount > 0 && <div className="space-y-1" aria-live="polite">
              <p className="text-sm font-semibold">{t('savedCount', { count: savedCount })} · {formatTHB(savedRows.reduce((sum, row) => sum + row.amount_satang, 0))}</p>
              {savedRows.map((row) => <div key={row.id} className="flex items-center gap-2 border-t border-border py-2 text-sm">
                <TransactionTypeBadge type={row.type} label={t(row.type === 'income' ? 'income' : 'expense')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{row.note || row.counterparty || <CategoryLabel value={row.category} />}</span>
                  <span className="block truncate text-muted-foreground">{new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(row.datetime))} · <CategoryLabel value={row.category} /></span>
                </span>
                <strong className={row.type === 'income' ? 'tabular-nums text-income' : 'tabular-nums text-expense'}>{row.type === 'income' ? '+' : '−'}{formatTHB(row.amount_satang)}</strong>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-xs font-medium text-success"><Check className="size-3.5" />{t('confirmed')}</span>
              </div>)}
            </div>}
            <button type="button" className="min-h-11 w-full text-sm text-honey-text" onClick={() => setShowRemainder(true)}>{t('later')}</button>
            {showRemainder && currentGap !== 0 && <button type="button" className="flex min-h-11 w-full items-start gap-3 rounded-md bg-info-soft p-4 text-left text-sm" onClick={() => setStep(3)}><Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-transfer" /><span>{t('remainderOffer', { amount: formatTHB(Math.abs(currentGap)), type: t(currentGap > 0 ? 'expense' : 'income') })}</span></button>}
          </>}

          {step === 3 && bankBalance !== null && <>
            <div className="border-b border-border pb-4 text-center">
              <p className="text-sm text-muted-foreground">{t('remainderCategory', { type: t(currentGap > 0 ? 'expense' : 'income') })}</p>
              <p className="text-4xl font-bold leading-[1.35] tabular-nums text-focal">{currentGap > 0 ? '−' : '+'}{formatTHB(Math.abs(currentGap))}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip pressed={remainderDate === bangkokDate()} onClick={() => setRemainderDate(bangkokDate())}>{t('todayWithDate', { date: formatAppDate(`${bangkokDate()}T12:00:00+07:00`, { locale: locale === 'th' ? 'th' : 'en', includeYear: false }) })}</Chip>
              {todayDay <= 7 && <Chip pressed={remainderDate === previousMonthEndBangkok()} onClick={() => setRemainderDate(previousMonthEndBangkok())}>{t('lastMonthEnd')}</Chip>}
            </div>
            <div className="rounded-md bg-warn-soft p-4">
              <div className="flex items-start gap-3"><AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" /><p className="text-sm">{t('remainderConsequence', { type: t(currentGap > 0 ? 'expense' : 'income') })}</p></div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy} onClick={() => saveRemainder(`${remainderDate}T23:59:00+07:00`)}>{busy ? t('saving') : t('saveRemainder', { amount: formatTHB(Math.abs(currentGap)) })}</Button>
            <button type="button" className="min-h-11 w-full text-sm text-honey-text" onClick={() => setStep(2)}>{t('back')}</button>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function GapWords({ gap, lastChecked }: { gap: number; lastChecked: string | null }) {
  const t = useTranslations('reconcile')
  if (gap === 0) return <div className="flex items-center gap-2 rounded-md bg-success-soft p-3 text-sm font-medium"><Check className="size-5" />{t('matched')}</div>
  return <div className="space-y-2 rounded-md border-[1.5px] border-honey-edge bg-secondary p-4"><p className="font-semibold tabular-nums">{t(gap > 0 ? 'appHigher' : 'bankHigher', { amount: formatTHB(Math.abs(gap)) })}</p><p className="text-sm">{t(gap > 0 ? 'likelyOut' : 'likelyIn')}</p>{lastChecked && <p className="text-sm text-muted-foreground">{t('lastChecked', { date: lastChecked })}</p>}</div>
}

function GapBar({ startGap, gap }: { startGap: number; gap: number }) {
  const t = useTranslations('reconcile')
  const progress = gapProgress(startGap, gap)
  const label = progress.done ? t('matched') : progress.overshoot ? t('overshoot', { amount: formatTHB(progress.current) }) : t('remaining', { amount: formatTHB(progress.current) })
  return <div className={progress.done ? 'rounded-md bg-success-soft p-3' : progress.overshoot ? 'rounded-md bg-warn-soft p-3' : 'rounded-md border-[1.5px] border-honey-edge bg-secondary p-4'} aria-live="polite">
    <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold"><span className="inline-flex items-center gap-1.5">{progress.done ? <Check className="size-4" /> : progress.overshoot ? <AlertTriangle className="size-4" /> : null}{label}</span><span>{t('from', { amount: formatTHB(progress.start) })}</span></div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={progress.start} aria-valuenow={progress.explained} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left rounded-full bg-primary transition-transform motion-reduce:transition-none" style={{ transform: `scaleX(${progress.start === 0 ? 1 : progress.explained / progress.start})` }} /></div>
  </div>
}
