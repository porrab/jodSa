'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, QrCode, ChevronRight, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Chip } from '@/components/ui/chip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import {
  createAccount, updateAccount, deleteAccount, uploadAccountQr, removeAccountQr,
} from '@/app/actions/accounts'
import { BANKS, BANK_LABEL_KEYS } from '@/lib/validators/account'
import { formatTHB } from '@/lib/money'
import { PageHeader } from '@/components/ui/page-header'
import TransactionRowCopy from '@/components/transaction-row-copy'
import { TransactionTypeBadge, transactionAmountPrefix, TRANSACTION_TYPE_STYLE } from '@/components/transaction-type-indicator'
import { format } from 'date-fns'
import type { Database } from '@/lib/supabase/types'
import ReconcileAccountSheet from '@/components/reconcile-account-sheet'

type Account = {
  id: string
  name: string
  bank: string
  balance: number
  opening_balance_satang: number
  number_hint: string | null
  qr_image_path: string | null
  reconciled_at: string | null
  qrUrl: string | null
}
type RecentTransaction = Database['public']['Tables']['transactions']['Row']

function AccountForm({
  defaultValues,
  action,
  onSuccess,
}: {
  defaultValues?: {
    name: string
    bank: string
    id?: string
    openingBalanceSatang?: number
    numberHint?: string | null
  }
  action: typeof createAccount | typeof updateAccount
  onSuccess: () => void
}) {
  const t = useTranslations('account')
  const tc = useTranslations('common')
  const [bank, setBank] = useState(defaultValues?.bank ?? '')
  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      if (bank) fd.set('bank', bank)
      const result = await action(prev, fd)
      if (!result.error) onSuccess()
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-4">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}
      <div className="space-y-1">
        <Label htmlFor="name">{t('name')} <RequiredMark /></Label>
        <Input id="name" name="name" defaultValue={defaultValues?.name} required />
      </div>
      <div className="space-y-1">
        <Label>{t('bank')} <RequiredMark /></Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('bank')}>
          {BANKS.map((b) => (
            <Chip key={b} data-bank-code={b} pressed={bank === b} onClick={() => setBank(b)}>{t(`bankLabels.${BANK_LABEL_KEYS[b]}`)}</Chip>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="opening_balance">{t('openingBalance')}</Label>
        <Input
          id="opening_balance"
          name="opening_balance"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          className="tabular-nums"
          defaultValue={
            defaultValues?.openingBalanceSatang
              ? (defaultValues.openingBalanceSatang / 100).toFixed(2)
              : ''
          }
        />
        <p className="text-sm text-muted-foreground">{t('openingBalanceHint')}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="number_hint">{t('numberHint')}</Label>
        <Input
          id="number_hint"
          name="number_hint"
          defaultValue={defaultValues?.numberHint ?? ''}
          placeholder="4415"
        />
        <p className="text-sm text-muted-foreground">{t('numberHintHint')}</p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  )
}

function QrManageDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const t = useTranslations('account')
  const tc = useTranslations('common')
  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      const result = await uploadAccountQr(prev, fd)
      if (!result.error) toast.success(t('qrSaved'))
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  async function handleRemove() {
    try {
      await removeAccountQr(account.id)
      toast.success(t('qrRemoved'))
      onClose()
    } catch {
      toast.error(t('qrRemoveFailed'))
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('qrTitle', { name: account.name })}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('qrHint')}</p>
        {account.qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.qrUrl}
            alt={t('qrAlt', { name: account.name })}
            className="mx-auto max-h-64 rounded-lg border"
          />
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('qrEmpty')}
          </div>
        )}
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={account.id} />
          <div className="space-y-1">
            <Label htmlFor={`qr-file-${account.id}`}>
              {account.qrUrl ? t('qrReplace') : t('qrUpload')}
            </Label>
            <Input
              id={`qr-file-${account.id}`}
              name="file"
              type="file"
              accept="image/*"
              required
            />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? t('qrUploading') : tc('save')}
            </Button>
            {account.qrUrl && (
              <Button type="button" variant="outline" onClick={handleRemove}>
                {t('qrRemove')}
              </Button>
            )}
          </div>
        </form>
      </div>
    </DialogContent>
  )
}

/**
 * J3-style detail sheet (design v3): row tap opens this instead of always-on
 * per-row icon actions. แก้ไข/QR live inside; ลบ is destructive, separated
 * from the primary action, never an inline row icon.
 */
function AccountDetailSheet({
  account,
  accounts,
  recentTransactions,
  holdingSymbols,
  open,
  onOpenChange,
}: {
  account: Account | null
  accounts: Account[]
  recentTransactions: RecentTransaction[]
  holdingSymbols: Record<string, string>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('account')
  const tt = useTranslations('transaction')
  const [editing, setEditing] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)

  function close() {
    setEditing(false)
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!account) return
    if (!confirm(t('deleteConfirm'))) return
    try {
      await deleteAccount(account.id)
      toast.success(t('deleted'))
      close()
    } catch {
      toast.error(t('deleteFailed'))
    }
  }

  if (!account) return null
  const accountMap = Object.fromEntries(accounts.map((item) => [item.id, item]))
  const recent = recentTransactions.filter((tx) => tx.account_id === account.id || tx.to_account_id === account.id).slice(0, 5)

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <SheetContent side="bottom" className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{account.name}</SheetTitle>
        </SheetHeader>

        {editing ? (
          <div className="px-4 pb-6">
            <AccountForm
              defaultValues={{
                id: account.id,
                name: account.name,
                bank: account.bank,
                openingBalanceSatang: account.opening_balance_satang,
                numberHint: account.number_hint,
              }}
              action={updateAccount}
              onSuccess={close}
            />
          </div>
        ) : (
          <div className="space-y-3 px-4 pb-6">
            <div className="border-b border-border pb-3 text-center">
              <p className="text-sm text-muted-foreground">
              {account.bank}
              {account.number_hint && ` · ${t('numberHint')} ${account.number_hint}`}
              </p>
              <p className={`text-4xl font-bold leading-[1.35] tabular-nums text-focal ${account.balance < 0 ? 'text-destructive' : ''}`}>
                {formatTHB(account.balance)}
              </p>
            </div>

            <div className="space-y-3 rounded-lg bg-secondary p-4">
              <div className="flex items-start gap-3">
                <Scale className="mt-0.5 size-5 shrink-0 text-honey-text" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">ยอดตรงกับแอปธนาคารไหม?</p>
                  <p className="text-sm text-muted-foreground">
                    {account.reconciled_at
                      ? `เช็กล่าสุด ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(account.reconciled_at))}`
                      : 'ยังไม่เคยตรวจยอด'}
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" className="w-full bg-card" onClick={() => setReconcileOpen(true)}>
                ปรับยอดให้ตรงธนาคาร
              </Button>
            </div>

            <ReconcileAccountSheet
              account={account}
              accounts={accounts}
              recentTransactions={recentTransactions}
              open={reconcileOpen}
              onOpenChange={setReconcileOpen}
            />

            {recent.length > 0 && <div className="divide-y divide-border">
              {recent.map((tx) => {
                const style = TRANSACTION_TYPE_STYLE[tx.type] ?? TRANSACTION_TYPE_STYLE.expense
                return <div key={tx.id} className="flex items-center gap-3 py-3">
                  <TransactionTypeBadge type={tx.type} label={tx.type === 'invest' ? tt('invest') : tx.type === 'divest' ? tt('divest') : tx.type} />
                  <TransactionRowCopy tx={tx} holdingSymbol={tx.holding_id ? holdingSymbols[tx.holding_id] : null} toAccountName={tx.to_account_id ? accountMap[tx.to_account_id]?.name : null} time={format(new Date(tx.datetime), 'HH:mm')} />
                  <span className={`shrink-0 font-semibold tabular-nums ${style.text}`}>{transactionAmountPrefix(tx.type)}{formatTHB(tx.amount_satang)}</span>
                </div>
              })}
            </div>}

            <div className="rounded-lg border p-3 text-center">
              {account.qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.qrUrl} alt={t('qrAlt', { name: account.name })} className="mx-auto max-h-40 rounded-lg" />
              ) : (
                <p className="text-sm text-muted-foreground">{t('qrEmpty')}</p>
              )}
              <Dialog open={qrOpen} onOpenChange={setQrOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="mt-2">
                    <QrCode className="mr-1.5 size-3.5" />
                    {t('qrManage')}
                  </Button>
                </DialogTrigger>
                <QrManageDialog account={account} onClose={() => setQrOpen(false)} />
              </Dialog>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
              {t('edit')}
            </Button>
            <button
              type="button"
              onClick={handleDelete}
              className="block w-full pt-1 text-left text-sm text-destructive hover:underline"
            >
              {t('deleteAction')}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default function AccountsClient({
  accounts,
  recentTransactions,
  holdingSymbols,
  initialAccountId,
}: {
  accounts: Account[]
  recentTransactions: RecentTransaction[]
  holdingSymbols: Record<string, string>
  initialAccountId: string | null
}) {
  const t = useTranslations('account')
  const [addOpen, setAddOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(
    accounts.some((account) => account.id === initialAccountId) ? initialAccountId : null,
  )
  const detailAccount = accounts.find((a) => a.id === detailId) ?? null

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" />{t('add')}</Button>}
      />
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-lg overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('add')}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6"><AccountForm action={createAccount} onSuccess={() => setAddOpen(false)} /></div>
        </SheetContent>
      </Sheet>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>{t('noAccounts')}</p>
          <p className="text-sm mt-1">{t('addFirst')}</p>
        </div>
      ) : (
        // Compact rows (design v3) — replaces the tall per-account cards with
        // 3 always-visible icon actions. Density budget: single line, amount
        // right/tabular; tap opens the detail sheet for edit/QR/delete.
        <div>
          <div className="mb-2">
            <p className="text-sm text-muted-foreground">{t('summaryCount', { count: accounts.length })}</p>
            <p className="text-[28px] font-bold leading-[1.35] tabular-nums">{formatTHB(accounts.reduce((sum, account) => sum + account.balance, 0))}</p>
          </div>
          <div className="divide-y divide-border border-y border-border">
          {accounts.map((acct) => (
            <button
              key={acct.id}
              type="button"
              onClick={() => setDetailId(acct.id)}
              className="flex w-full min-h-14 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{acct.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{acct.bank}</p>
              </div>
              <p className={`shrink-0 text-sm font-semibold tabular-nums ${acct.balance < 0 ? 'text-destructive' : ''}`}>
                {formatTHB(acct.balance)}
              </p>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          </div>
        </div>
      )}

      <AccountDetailSheet
        account={detailAccount}
        accounts={accounts}
        recentTransactions={recentTransactions}
        holdingSymbols={holdingSymbols}
        open={detailId !== null}
        onOpenChange={(o) => { if (!o) setDetailId(null) }}
      />
    </div>
  )
}
