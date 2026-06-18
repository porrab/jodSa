'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createTransaction } from '@/app/actions/transactions'
import { CATEGORIES } from '@/lib/validators/transaction'
import { resolveAccountDefault, type LastAccountMap } from '@/lib/last-account'
import type { Database } from '@/lib/supabase/types'

type Account = Database['public']['Tables']['accounts']['Row']
type TxType = 'income' | 'expense' | 'transfer'

const TYPE_ACTIVE_CLS: Record<TxType, string> = {
  income:   'border-income/40 bg-income/15 text-income hover:bg-income/25',
  expense:  'border-expense/40 bg-expense/15 text-expense hover:bg-expense/25',
  transfer: 'border-transfer/40 bg-transfer/15 text-transfer hover:bg-transfer/25',
}

export default function TransactionForm({
  accounts,
  onSuccess,
  defaultValues,
  lastByCategory = {},
  globalLastAccountId = null,
}: {
  accounts: Account[]
  onSuccess?: () => void
  defaultValues?: Partial<{
    type: TxType
    amount: string
    account_id: string
    to_account_id: string
    category: string
    counterparty: string
    datetime: string
    ref_code: string
    bank_code: string
  }>
  lastByCategory?: LastAccountMap
  globalLastAccountId?: string | null
}) {
  const t = useTranslations('transaction')
  const [type, setType] = useState<TxType>(defaultValues?.type ?? 'expense')
  const fallbackAccountId = accounts[0]?.id ?? null
  const [accountId, setAccountId] = useState(() =>
    defaultValues?.account_id ??
    resolveAccountDefault({
      category: defaultValues?.category,
      lastByCategory,
      globalLastAccountId,
      parsedAccountId: null,
      fallbackAccountId,
    }) ?? '',
  )
  // Precedence rule #1 — once the user picks an account themselves, no later
  // category change is allowed to overwrite their choice.
  const [accountTouched, setAccountTouched] = useState(false)
  const [toAccountId, setToAccountId] = useState(defaultValues?.to_account_id ?? '')
  const [category, setCategory] = useState(defaultValues?.category ?? '')

  function handleAccountChange(id: string) {
    setAccountId(id)
    setAccountTouched(true)
  }

  function handleCategoryChange(c: string) {
    setCategory(c)
    if (accountTouched) return
    const next = resolveAccountDefault({
      category: c,
      lastByCategory,
      globalLastAccountId,
      parsedAccountId: null,
      fallbackAccountId,
    })
    if (next) setAccountId(next)
  }

  const now = new Date()
  const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('type', type)
      fd.set('account_id', accountId)
      if (type === 'transfer') fd.set('to_account_id', toAccountId)
      if (category) fd.set('category', category)
      // Convert local datetime to offset-aware ISO
      const dtLocal = fd.get('datetime') as string
      if (dtLocal) {
        const dt = new Date(dtLocal)
        fd.set('datetime', dt.toISOString())
      }
      const result = await createTransaction(prev, fd)
      if (!result.error) {
        toast.success(t('saved'))
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-4">
      {/* Type */}
      <div className="space-y-1">
        <Label>{t('type')}</Label>
        <div className="flex gap-2">
          {(['income', 'expense', 'transfer'] as const).map((ty) => (
            <Button
              key={ty}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setType(ty)}
              className={cn('flex-1', type === ty && TYPE_ACTIVE_CLS[ty])}
            >
              {t(ty)}
            </Button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="space-y-1">
        <Label htmlFor="amount">{t('amount')}</Label>
        <Input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={defaultValues?.amount}
          required
        />
      </div>

      {/* Account */}
      <div className="space-y-1">
        <Label>{type === 'transfer' ? t('fromAccount') : t('account')}</Label>
        <Select value={accountId} onValueChange={handleAccountChange} required>
          <SelectTrigger>
            <SelectValue placeholder={t('selectAccount')} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} — {a.bank}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* To account (transfer only) */}
      {type === 'transfer' && (
        <div className="space-y-1">
          <Label>{t('toAccount')}</Label>
          <Select value={toAccountId} onValueChange={setToAccountId} required>
            <SelectTrigger>
              <SelectValue placeholder={t('selectToAccount')} />
            </SelectTrigger>
            <SelectContent>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} — {a.bank}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Category (non-transfer) */}
      {type !== 'transfer' && (
        <div className="space-y-1">
          <Label>{t('categoryOptional')}</Label>
          <Select value={category} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectCategory')} />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Counterparty (non-transfer) */}
      {type !== 'transfer' && (
        <div className="space-y-1">
          <Label htmlFor="counterparty">{t('counterpartyOptional')}</Label>
          <Input
            id="counterparty"
            name="counterparty"
            placeholder={t('counterpartyPlaceholder')}
            defaultValue={defaultValues?.counterparty}
          />
        </div>
      )}

      {/* Datetime */}
      <div className="space-y-1">
        <Label htmlFor="datetime">{t('date')}</Label>
        <Input
          id="datetime"
          name="datetime"
          type="datetime-local"
          defaultValue={defaultValues?.datetime ?? localISO}
          required
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t('saving') : t('save')}
      </Button>
    </form>
  )
}
