'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CategoryLabel } from '@/lib/categories'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createTransaction, updateTransaction } from '@/app/actions/transactions'
import { usePendingTx } from '@/components/pending-tx-provider'
import { toDatetimeLocal, type TxFormValues } from '@/lib/quick-add'
import { parseInputToSatang } from '@/lib/money'
import { CATEGORIES } from '@/lib/validators/transaction'
import { resolveAccountDefault, type LastAccountMap } from '@/lib/last-account'
import InlineCreateAccount from '@/components/inline-create-account'
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
  editId,
  optimistic = false,
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
  // Present → edit an existing transaction (M7-A); absent → create. ref_code is
  // never part of the edit payload (transactionUpdateSchema excludes it — J3:
  // "everything editable except ref_code"), so there's no field for it here.
  editId?: string
  /**
   * Opt into the optimistic J1 path (design v4 F6): hand the write to
   * `PendingTxProvider`, show a provisional row, and close immediately instead of
   * blocking on the round-trip.
   *
   * ⚠️ Only the global quick-add sheet passes this. It is deliberately NOT used
   * for edits, nor for the slip-import confirm — a slip's duplicate verdict is
   * decided server-side (`23505` on `UNIQUE(user_id, ref_code)`) and v3 specs a
   * whole UI for it, so a slip row must never be shown as saved before the
   * server has ruled. Manual entry is safe precisely because `ref_code` is null
   * there, so that collision cannot fire.
   */
  optimistic?: boolean
}) {
  const t = useTranslations('transaction')
  const pendingTx = usePendingTx()
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

  /** Shared field normalisation — both submit paths must build the SAME payload. */
  const fillFormData = (fd: FormData) => {
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
  }

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      // SPEC5-1: snapshot the user's RAW input before `fillFormData` normalises
      // it. That function rewrites `datetime` to a UTC ISO string for the server;
      // reading it back afterwards to rebuild the form (as this did) hands
      // `<input type="datetime-local">` a value it rejects, so a failed save
      // returned with the required date field blank. The restore payload and the
      // server payload are two different contracts — build the restore one first.
      const restoreValues: TxFormValues = {
        type,
        amount: (fd.get('amount') as string) || undefined,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : undefined,
        category: category || undefined,
        counterparty: (fd.get('counterparty') as string) || undefined,
        datetime: toDatetimeLocal(fd.get('datetime') as string),
      }

      fillFormData(fd)

      // Optimistic J1 path (design v4 F6). Hand the write to the provider, which
      // outlives this form — the sheet unmounts the moment we call onSuccess, so
      // an action awaited here would be torn down before it could roll back.
      if (optimistic && !editId) {
        const amountSatang = parseInputToSatang(fd.get('amount') as string)
        if (!amountSatang) {
          const error = t('invalidAmount')
          toast.error(error)
          return { error }
        }
        const account = accounts.find((a) => a.id === accountId)
        const toAccount = accounts.find((a) => a.id === toAccountId)
        pendingTx.submit(
          fd,
          {
            type,
            amountSatang,
            label:
              (fd.get('counterparty') as string) ||
              (type === 'transfer' && toAccount ? `→ ${toAccount.name}` : (account?.name ?? '—')),
            category: category || null,
          },
          restoreValues,
        )
        onSuccess?.()
        return { error: '' }
      }

      const result = editId ? await updateTransaction(prev, fd) : await createTransaction(prev, fd)
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
      {editId && <input type="hidden" name="id" value={editId} />}
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

      {/* Amount — hero input: ฿ prefix + large tabular-nums (design 07) */}
      <div className="space-y-1">
        <Label htmlFor="amount">{t('amount')} <RequiredMark /></Label>
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
          <span className="select-none text-2xl font-semibold tabular-nums text-muted-foreground">฿</span>
          <Input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={defaultValues?.amount}
            required
            // See quick-add-card.tsx: the Input base's `md:text-sm` outranks the
            // unprefixed size at >= md, so the hero amount needs its own md: rule.
            className="h-14 border-0 bg-transparent px-0 text-3xl font-semibold tabular-nums shadow-none focus-visible:ring-0 md:text-3xl"
          />
        </div>
      </div>

      {/* Account — global empty-source rule (design v3, J4): an empty list
          renders an inline "+ สร้าง…" create action, never a disabled/dead
          control (the outside tester's exact zero-account dead end). */}
      <div className="space-y-1">
        <Label>{type === 'transfer' ? t('fromAccount') : t('account')} <RequiredMark /></Label>
        {accounts.length === 0 ? (
          <InlineCreateAccount
            hint={t('noAccountsInlineHint')}
            onCreated={(id) => { setAccountId(id); setAccountTouched(true) }}
          />
        ) : (
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
        )}
      </div>

      {/* To account (transfer only) */}
      {type === 'transfer' && (
        <div className="space-y-1">
          <Label>{t('toAccount')} <RequiredMark /></Label>
          {accounts.filter((a) => a.id !== accountId).length === 0 ? (
            <InlineCreateAccount
              hint={t('transferNeedsSecondAccount')}
              onCreated={(id) => setToAccountId(id)}
            />
          ) : (
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
          )}
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
                <SelectItem key={c} value={c}><CategoryLabel value={c} /></SelectItem>
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
        <Label htmlFor="datetime">{t('date')} <RequiredMark /></Label>
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
