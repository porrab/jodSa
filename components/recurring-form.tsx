'use client'

import { useActionState, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, ChevronRight, AlertTriangle, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Mascot } from '@/components/mascot'
import { CategoryLabel } from '@/lib/categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { AmountInput } from '@/components/ui/amount-input'
import { Chip } from '@/components/ui/chip'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import AccountGrid from '@/components/account-grid'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
  createRecurringRule, updateRecurringRule, deleteRecurringRule,
} from '@/app/actions/recurring'
import { WEEKDAYS } from '@/lib/validators/recurring'
import { CATEGORIES } from '@/lib/validators/transaction'
import { formatTHB } from '@/lib/money'
import InlineCreateAccount from '@/components/inline-create-account'
import { PageHeader } from '@/components/ui/page-header'
import { formatAppDate } from '@/lib/date-display'
import { useAccountBalances } from '@/lib/use-account-balances'
import { TransactionTypeBadge } from '@/components/transaction-type-indicator'

type Account = { id: string; name: string; bank: string }

export type Rule = {
  id: string
  type: 'income' | 'expense'
  amount_satang: number
  category: string | null
  account_id: string
  freq: 'weekly' | 'monthly' | 'yearly'
  interval: number
  by_weekday: number[] | null
  start_date: string
  end_date: string | null
}

function RuleForm({
  accounts,
  defaultValues,
  action,
  onSuccess,
}: {
  accounts: Account[]
  defaultValues?: Rule
  action: typeof createRecurringRule | typeof updateRecurringRule
  onSuccess: () => void
}) {
  const t = useTranslations('recurring')
  const locale = useLocale() === 'th' ? 'th' : 'en'
  const tc = useTranslations('common')
  const [type, setType] = useState<'income' | 'expense'>(defaultValues?.type ?? 'expense')
  const [accountId, setAccountId] = useState(defaultValues?.account_id ?? accounts[0]?.id ?? '')
  const [category, setCategory] = useState(defaultValues?.category ?? '')
  const [freq, setFreq] = useState<'weekly' | 'monthly' | 'yearly'>(defaultValues?.freq ?? 'monthly')
  const [weekdays, setWeekdays] = useState<number[]>(defaultValues?.by_weekday ?? [])
  const { balances, loading: balancesLoading } = useAccountBalances(accounts.length > 0)

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('type', type)
      fd.set('account_id', accountId)
      if (category) fd.set('category', category)
      fd.set('freq', freq)
      fd.delete('by_weekday')
      if (freq === 'weekly') for (const d of weekdays) fd.append('by_weekday', String(d))
      const result = await action(prev, fd)
      if (!result.error) onSuccess()
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  function toggleWeekday(d: number) {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  }

  return (
    <form action={formAction} className="space-y-4">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      <Segmented className="grid-cols-2" aria-label={t('type')}>
        <SegmentedItem active={type === 'income'} onClick={() => setType('income')} className="inline-flex items-center justify-center gap-1.5 text-income"><ArrowDownLeft aria-hidden="true" className="size-4" />{t('typeIncome')}</SegmentedItem>
        <SegmentedItem active={type === 'expense'} onClick={() => setType('expense')} className="inline-flex items-center justify-center gap-1.5 text-expense"><ArrowUpRight aria-hidden="true" className="size-4" />{t('typeExpense')}</SegmentedItem>
      </Segmented>

      <AmountInput
        id="amount" name="amount" caption={<>{t('amountLabel')} <RequiredMark /></>}
        required defaultValue={defaultValues ? (defaultValues.amount_satang / 100).toFixed(2) : ''}
      />

      <div className="space-y-1.5">
        <Label>{t('account')} <RequiredMark /></Label>
        <AccountGrid accounts={accounts} value={accountId} onValueChange={setAccountId} balances={balances} balancesLoading={balancesLoading} label={t('account')} />
      </div>

      <div className="space-y-1.5">
        <Label>{t('categoryOptional')}</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} pressed={category === c} onClick={() => setCategory(c)}><CategoryLabel value={c} /></Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t('freq')}</Label>
          <div className="flex flex-wrap gap-2">
            {(['weekly', 'monthly', 'yearly'] as const).map((value) => (
              <Chip key={value} pressed={freq === value} onClick={() => setFreq(value)}>{t(`freq${value[0].toUpperCase()}${value.slice(1)}`)}</Chip>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="interval">{t('everyLabel')} <RequiredMark /></Label>
          <Input
            id="interval" name="interval" type="number" min={1} max={99} required
            defaultValue={defaultValues?.interval ?? 1}
          />
        </div>
      </div>

      {freq === 'weekly' && (
        <div className="space-y-1.5">
          <Label>{t('weekdaysLabel')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => toggleWeekday(w.value)}
                className={`size-9 rounded-md border text-sm transition-colors ${
                  weekdays.includes(w.value)
                    ? 'border-2 border-honey-edge bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                }`}
              >
                {t(`wd${w.value}`)}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{t('weekdaysHint')}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start_date">{t('startDate')} <RequiredMark /></Label>
          <Input
            id="start_date" name="start_date" type="date" required
            defaultValue={defaultValues?.start_date ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_date">{t('endDateOptional')}</Label>
          <Input
            id="end_date" name="end_date" type="date"
            defaultValue={defaultValues?.end_date ?? ''}
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending || accounts.length === 0}>
        {isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  )
}

export interface RuleStatus {
  lastDeducted: string | null // YYYY-MM-DD, last materialized occurrence (any month)
  nextDue: string | null // YYYY-MM-DD, first occurrence after today; null if rule ended
  error: string | null // set when this rule's materialization failed this load (J7)
}

type Translate = (key: string, values?: Record<string, string | number>) => string

function freqSummary(rule: Rule, t: Translate): string {
  const unit = t(`unit_${rule.freq}`)
  const every =
    rule.interval > 1 ? t('everyN', { n: rule.interval, unit }) : t('every', { unit })
  if (rule.freq === 'weekly' && rule.by_weekday?.length) {
    const days = rule.by_weekday
      .slice()
      .sort((a, b) => a - b)
      .map((d) => t(`wd${d}`))
      .join(' ')
    return `${every} · ${days}`
  }
  return every
}

export default function RecurringClient({
  rules,
  accounts,
  status = {},
}: {
  rules: Rule[]
  accounts: Account[]
  status?: Record<string, RuleStatus>
}) {
  const t = useTranslations('recurring')
  const locale = useLocale() === 'th' ? 'th' : 'en'
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    try {
      await deleteRecurringRule(id)
      toast.success(t('deleted'))
    } catch {
      toast.error(t('deleteFailed'))
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={accounts.length > 0 ? <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" />{t('addShort')}</Button> : undefined}
      />
      {/* Account — global empty-source rule (design v3, J4): an empty list
          renders an inline "+ สร้าง…" create action, never a disabled control
          with only a text hint. */}
      {accounts.length === 0 ? (
        <InlineCreateAccount hint={t('needAccountFirst')} onCreated={() => setAddOpen(true)} />
      ) : (
        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-lg overflow-y-auto rounded-t-2xl">
            <SheetHeader><SheetTitle>{t('add')}</SheetTitle></SheetHeader>
            <div className="px-4 pb-6"><RuleForm accounts={accounts} action={createRecurringRule} onSuccess={() => setAddOpen(false)} /></div>
          </SheetContent>
        </Sheet>
      )}

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <Mascot expr="shrug" className="mx-auto mb-3 h-20 w-20 opacity-80" />
          <p>{t('empty')}</p>
          <p className="text-sm mt-1">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {rules.map((rule) => {
            const acct = accounts.find((a) => a.id === rule.account_id)
            return (
              <div key={rule.id}>
                <button type="button" onClick={() => setEditId(rule.id)} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-accent/40">
                  <TransactionTypeBadge type={rule.type} label={t(rule.type === 'income' ? 'typeIncome' : 'typeExpense')} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="break-words font-medium leading-snug">{rule.category ? <CategoryLabel value={rule.category} /> : t('uncategorized')}</p>
                    <p className="text-sm text-muted-foreground">{freqSummary(rule, t)} · {acct?.name ?? '—'}</p>
                  {/* J7 — "did it work?" in one line: last deducted / next due, or an
                      explicit error state instead of a silent no-op. */}
                  {status[rule.id]?.error ? (
                    <p className="flex items-center gap-1 text-sm font-medium text-destructive">
                      <AlertTriangle className="size-3 shrink-0" />
                      {t('materializeError')}
                    </p>
                  ) : (
                    <p className="text-sm">
                      {status[rule.id]?.lastDeducted
                        ? t('lastDeducted', { date: formatAppDate(status[rule.id]!.lastDeducted!, { locale, includeYear: true }) })
                        : t('lastDeductedNone')}
                      {' · '}
                      {status[rule.id]?.nextDue
                        ? t('nextDue', { date: formatAppDate(status[rule.id]!.nextDue!, { locale, includeYear: true }) })
                        : t('nextDueNone')}
                    </p>
                  )}
                  </div>
                  <p className={`shrink-0 font-semibold tabular-nums ${rule.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {rule.type === 'income' ? '+' : '−'}{formatTHB(rule.amount_satang)}
                  </p>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
                <Sheet open={editId === rule.id} onOpenChange={(o) => setEditId(o ? rule.id : null)}>
                  <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-lg overflow-y-auto rounded-t-2xl">
                    <SheetHeader><SheetTitle>{t('edit')}</SheetTitle></SheetHeader>
                    <div className="space-y-6 px-4 pb-6">
                      <RuleForm accounts={accounts} defaultValues={rule} action={updateRecurringRule} onSuccess={() => setEditId(null)} />
                      <button type="button" onClick={() => handleDelete(rule.id)} className="text-sm text-destructive hover:underline">{t('deleteAction')}</button>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
