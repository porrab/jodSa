'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { Mascot } from '@/components/mascot'
import { CategoryLabel } from '@/lib/categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  createRecurringRule, updateRecurringRule, deleteRecurringRule,
} from '@/app/actions/recurring'
import { WEEKDAYS } from '@/lib/validators/recurring'
import { CATEGORIES } from '@/lib/validators/transaction'
import { formatTHB } from '@/lib/money'

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
  const tc = useTranslations('common')
  const [type, setType] = useState<'income' | 'expense'>(defaultValues?.type ?? 'expense')
  const [accountId, setAccountId] = useState(defaultValues?.account_id ?? accounts[0]?.id ?? '')
  const [category, setCategory] = useState(defaultValues?.category ?? '')
  const [freq, setFreq] = useState<'weekly' | 'monthly' | 'yearly'>(defaultValues?.freq ?? 'monthly')
  const [weekdays, setWeekdays] = useState<number[]>(defaultValues?.by_weekday ?? [])

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

      <div className="space-y-1.5">
        <Label>{t('type')}</Label>
        <Select value={type} onValueChange={(v) => setType(v as 'income' | 'expense')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">{t('typeExpense')}</SelectItem>
            <SelectItem value="income">{t('typeIncome')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="amount">{t('amountLabel')} <RequiredMark /></Label>
        <Input
          id="amount" name="amount" type="text" inputMode="decimal" required
          defaultValue={defaultValues ? (defaultValues.amount_satang / 100).toFixed(2) : ''}
          placeholder="0.00"
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t('account')} <RequiredMark /></Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger><SelectValue placeholder={t('selectAccount')} /></SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name} ({a.bank})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t('categoryOptional')}</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue placeholder={t('selectCategory')} /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}><CategoryLabel value={c} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t('freq')}</Label>
          <Select value={freq} onValueChange={(v) => setFreq(v as typeof freq)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">{t('freqWeekly')}</SelectItem>
              <SelectItem value="monthly">{t('freqMonthly')}</SelectItem>
              <SelectItem value="yearly">{t('freqYearly')}</SelectItem>
            </SelectContent>
          </Select>
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
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                }`}
              >
                {t(`wd${w.value}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('weekdaysHint')}</p>
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
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button disabled={accounts.length === 0}>
            <Plus className="size-4 mr-2" />{t('add')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('add')}</DialogTitle></DialogHeader>
          <RuleForm accounts={accounts} action={createRecurringRule} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('needAccountFirst')}</p>
      )}

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <Mascot expr="shrug" className="mx-auto mb-3 h-20 w-20 opacity-80" />
          <p>{t('empty')}</p>
          <p className="text-sm mt-1">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rules.map((rule) => {
            const acct = accounts.find((a) => a.id === rule.account_id)
            return (
              <Card key={rule.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className={`tabular-nums ${rule.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {rule.type === 'income' ? '+' : '-'}{formatTHB(rule.amount_satang)}
                    </span>
                    <div className="flex gap-1">
                      <Dialog open={editId === rule.id} onOpenChange={(o) => setEditId(o ? rule.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] overflow-y-auto">
                          <DialogHeader><DialogTitle>{t('edit')}</DialogTitle></DialogHeader>
                          <RuleForm
                            accounts={accounts}
                            defaultValues={rule}
                            action={updateRecurringRule}
                            onSuccess={() => setEditId(null)}
                          />
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                  <p>{freqSummary(rule, t)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {acct && <Badge variant="secondary">{acct.name}</Badge>}
                    {rule.category && <Badge variant="outline"><CategoryLabel value={rule.category} /></Badge>}
                  </div>
                  <p className="text-xs">
                    {t('startsOn', { date: rule.start_date })}
                    {rule.end_date ? ` · ${t('untilDate', { date: rule.end_date })}` : ''}
                  </p>
                  {/* J7 — "did it work?" in one line: last deducted / next due, or an
                      explicit error state instead of a silent no-op. */}
                  {status[rule.id]?.error ? (
                    <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                      <AlertTriangle className="size-3 shrink-0" />
                      {t('materializeError')}
                    </p>
                  ) : (
                    <p className="text-xs">
                      {status[rule.id]?.lastDeducted
                        ? t('lastDeducted', { date: status[rule.id]!.lastDeducted! })
                        : t('lastDeductedNone')}
                      {' · '}
                      {status[rule.id]?.nextDue
                        ? t('nextDue', { date: status[rule.id]!.nextDue! })
                        : t('nextDueNone')}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
