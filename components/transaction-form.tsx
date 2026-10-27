'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpDown, ArrowUpRight, LockKeyhole } from 'lucide-react'
import { CategoryLabel } from '@/lib/categories'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { Chip } from '@/components/ui/chip'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { createTransaction, updateTransaction } from '@/app/actions/transactions'
import { usePendingTx } from '@/components/pending-tx-provider'
import { toDatetimeLocal, type TxFormValues } from '@/lib/quick-add'
import { parseInputToSatang } from '@/lib/money'
import { categoriesForType } from '@/lib/validators/transaction'
import { resolveAccountDefault, type LastAccountMap } from '@/lib/last-account'
import InlineCreateAccount from '@/components/inline-create-account'
import AccountGrid from '@/components/account-grid'
import DisplayNameField from '@/components/display-name-field'
import { useAccountBalances } from '@/lib/use-account-balances'
import type { Database } from '@/lib/supabase/types'

type Account = Pick<Database['public']['Tables']['accounts']['Row'], 'id' | 'name' | 'bank'>
type TxType = 'income' | 'expense' | 'transfer'

const TYPE_META: Record<TxType, { icon: typeof ArrowDownLeft; cls: string }> = {
  income: { icon: ArrowDownLeft, cls: 'text-income' },
  expense: { icon: ArrowUpRight, cls: 'text-expense' },
  transfer: { icon: ArrowLeftRight, cls: 'text-transfer' },
}

export default function TransactionForm({
  accounts,
  onSuccess,
  defaultValues,
  lastByCategory = {},
  globalLastAccountId = null,
  editId,
  optimistic = false,
  stickySubmit = false,
  idPrefix = 'transaction',
  hideDatetimeField = false,
  lockedAccountId,
  transferLockedSide = 'source',
  submitLabel,
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
    note: string
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
  stickySubmit?: boolean
  idPrefix?: string
  hideDatetimeField?: boolean
  lockedAccountId?: string
  transferLockedSide?: 'source' | 'destination'
  submitLabel?: string
}) {
  const t = useTranslations('transaction')
  const pendingTx = usePendingTx()
  const [type, setType] = useState<TxType>(defaultValues?.type ?? 'expense')
  const fallbackAccountId = accounts[0]?.id ?? null
  const [accountId, setAccountId] = useState(() =>
    lockedAccountId ?? defaultValues?.account_id ??
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
  const [toAccountId, setToAccountId] = useState(
    transferLockedSide === 'destination' && lockedAccountId
      ? lockedAccountId
      : (defaultValues?.to_account_id ?? ''),
  )
  const [category, setCategory] = useState(defaultValues?.category ?? '')
  const [counterparty, setCounterparty] = useState(defaultValues?.counterparty ?? '')
  const [note, setNote] = useState(defaultValues?.note ?? '')
  const { balances, loading: balancesLoading } = useAccountBalances(accounts.length > 0)
  const selectedAccount = accounts.find((account) => account.id === accountId)
  const categoryDefault =
    type !== 'transfer' && !accountTouched && !!category && lastByCategory[category] === accountId
  const visibleCategories = type === 'transfer' ? [] : categoriesForType(type)
  const accountLocked = Boolean(lockedAccountId) && (type !== 'transfer' || transferLockedSide === 'source')
  const destinationLocked = Boolean(lockedAccountId) && type === 'transfer' && transferLockedSide === 'destination'

  function handleTypeChange(nextType: TxType) {
    setType(nextType)
    if (lockedAccountId) {
      if (nextType !== 'transfer' || transferLockedSide === 'source') setAccountId(lockedAccountId)
      if (nextType === 'transfer' && transferLockedSide === 'destination') {
        setToAccountId(lockedAccountId)
        if (accountId === lockedAccountId) setAccountId(accounts.find((account) => account.id !== lockedAccountId)?.id ?? '')
      }
    }
    if (nextType === 'transfer' || (category && !categoriesForType(nextType).includes(category))) {
      setCategory('')
    }
  }

  function handleAccountChange(id: string) {
    setAccountId(id)
    if (id === toAccountId) setToAccountId('')
    setAccountTouched(true)
  }

  function swapAccounts() {
    if (!accountId || !toAccountId) return
    setAccountId(toAccountId)
    setToAccountId(accountId)
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
        counterparty: counterparty || undefined,
        note: note || undefined,
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
        const preview = {
          type,
          amountSatang,
          label:
            note ||
            counterparty ||
            (type === 'transfer' && toAccount ? `→ ${toAccount.name}` : (account?.name ?? '—')),
          category: category || null,
        }
        // Defer ALL optimistic side effects out of useActionState's transition.
        // React 19 runs this reducer inside a transition and holds the COMMIT of
        // every state update made within it — the provisional row (`addPending`)
        // and the instant sheet close (`onSuccess` → `setOpen(false)`) — until
        // the transition settles, which a Server Action started in-scope keeps
        // pending. Running the side effects one macrotask later, after the
        // reducer has returned and the transition has settled, lets them commit
        // immediately; the write still fires, just detached from the transition.
        // Without this, F6 is indistinguishable from the old blocking path
        // (QA-SPEC5-1: the branch runs but nothing commits until the POST lands).
        setTimeout(() => {
          pendingTx.submit(fd, preview, restoreValues)
          onSuccess?.()
        }, 0)
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
      <div>
        <Segmented className="grid-cols-3" aria-label={t('type')}>
          {(['income', 'expense', 'transfer'] as const).map((ty) => {
            const Icon = TYPE_META[ty].icon
            return (
            <SegmentedItem
              key={ty}
              onClick={() => handleTypeChange(ty)}
              active={type === ty}
              aria-label={t(ty)}
              className={cn('inline-flex items-center justify-center gap-1.5', TYPE_META[ty].cls)}
            >
              <Icon aria-hidden="true" className="size-4" />
              {ty === 'transfer' ? t('transferShort') : t(ty)}
            </SegmentedItem>
          )})}
        </Segmented>
      </div>

      <AmountInput
        id={`${idPrefix}-amount`}
        name="amount"
        caption={<>{t('amountCaption')} <RequiredMark /></>}
        defaultValue={defaultValues?.amount}
        required
      />

      {/* Category drives the account default, so it must come before the grid. */}
      {type !== 'transfer' && (
        <div data-testid="transaction-category-field" className="space-y-1">
          <Label>{t('categoryOptional')}</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('categoryOptional')}>
            {visibleCategories.map((c) => (
              <Chip key={c} pressed={category === c} onClick={() => handleCategoryChange(c)}>
                <CategoryLabel value={c} />
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Account — global empty-source rule (design v3, J4): an empty list
          renders an inline "+ สร้าง…" create action, never a disabled/dead
          control (the outside tester's exact zero-account dead end). */}
      <div data-testid="transaction-account-field" className="space-y-1">
        {!accountLocked && <div className="flex items-center justify-between gap-3">
          <Label>{type === 'transfer' ? t('fromAccount') : t('account')} <RequiredMark /></Label>
          {selectedAccount && (
            <span data-testid="account-selection-hint" className="truncate text-sm text-muted-foreground">
              {categoryDefault
                ? <>{t('selectedByCategory')} <CategoryLabel value={category} /></>
                : t('selectedAccount', { account: selectedAccount.name })}
            </span>
          )}
        </div>}
        {accountLocked ? (
          <div className="flex items-center gap-1.5 py-1 text-sm text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
            <span>{t('accountLockedDuringReconcile', { account: selectedAccount?.name ?? '—' })}</span>
          </div>
        ) : accounts.length === 0 ? (
          <InlineCreateAccount
            hint={t('noAccountsInlineHint')}
            onCreated={(id) => { setAccountId(id); setAccountTouched(true) }}
          />
        ) : (
          <AccountGrid
            accounts={accounts}
            value={accountId}
            onValueChange={handleAccountChange}
            balances={balances}
            balancesLoading={balancesLoading}
            label={type === 'transfer' ? t('fromAccount') : t('account')}
            disabledAccountId={destinationLocked ? lockedAccountId : undefined}
          />
        )}
      </div>

      {/* To account (transfer only) */}
      {type === 'transfer' && (
        <>
          <div data-testid="swap-divider" className="flex items-center gap-3 py-1">
            <span data-slot="swap-divider-line" aria-hidden="true" className="h-px flex-1 bg-border" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={swapAccounts}
              disabled={!accountId || !toAccountId || Boolean(lockedAccountId)}
              className="rounded-full bg-card px-3 shadow-none"
            >
              <ArrowUpDown aria-hidden="true" className="mr-1.5 size-4" />{t('swapAccounts')}
            </Button>
            <span data-slot="swap-divider-line" aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-1">
            <Label>{t('toAccount')} <RequiredMark /></Label>
            {destinationLocked ? (
              <div className="flex items-center gap-1.5 py-1 text-sm text-muted-foreground">
                <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
                <span>{t('accountLockedDuringReconcile', { account: accounts.find((account) => account.id === toAccountId)?.name ?? '—' })}</span>
              </div>
            ) : accounts.filter((a) => a.id !== accountId).length === 0 ? (
              <InlineCreateAccount
                hint={t('transferNeedsSecondAccount')}
                onCreated={(id) => setToAccountId(id)}
              />
            ) : (
              <AccountGrid
                accounts={accounts}
                value={toAccountId}
                onValueChange={setToAccountId}
                balances={balances}
                balancesLoading={balancesLoading}
                label={t('toAccount')}
                disabledAccountId={accountId}
              />
            )}
          </div>
        </>
      )}

      {/* Counterparty (non-transfer) */}
      {type !== 'transfer' && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-counterparty`}>{t('counterpartyOptional')}</Label>
          <Input
            id={`${idPrefix}-counterparty`}
            name="counterparty"
            placeholder={t('counterpartyPlaceholder')}
            value={counterparty}
            onChange={(event) => setCounterparty(event.target.value)}
          />
        </div>
      )}

      <DisplayNameField
        id={`${idPrefix}-note`}
        payee={counterparty}
        value={note}
        onChange={setNote}
      />

      {/* Datetime */}
      {hideDatetimeField ? (
        <input type="hidden" name="datetime" value={defaultValues?.datetime ?? localISO} />
      ) : (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-datetime`}>{t('date')} <RequiredMark /></Label>
          <Input
            id={`${idPrefix}-datetime`}
            name="datetime"
            type="datetime-local"
            defaultValue={defaultValues?.datetime ?? localISO}
            required
          />
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className={cn('w-full', stickySubmit && 'sticky bottom-0 z-10 shadow-lg')} disabled={isPending}>
        {isPending ? t('saving') : (submitLabel ?? t('save'))}
      </Button>
    </form>
  )
}
