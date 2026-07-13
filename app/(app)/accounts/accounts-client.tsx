'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, QrCode, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  createAccount, updateAccount, deleteAccount, uploadAccountQr, removeAccountQr,
} from '@/app/actions/accounts'
import { BANKS } from '@/lib/validators/account'
import { formatTHB } from '@/lib/money'

type Account = {
  id: string
  name: string
  bank: string
  balance: number
  opening_balance_satang: number
  number_hint: string | null
  qr_image_path: string | null
  qrUrl: string | null
}

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
        <Select value={bank} onValueChange={setBank} required>
          <SelectTrigger>
            <SelectValue placeholder={t('selectBank')} />
          </SelectTrigger>
          <SelectContent>
            {BANKS.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <p className="text-xs text-muted-foreground">{t('openingBalanceHint')}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="number_hint">{t('numberHint')}</Label>
        <Input
          id="number_hint"
          name="number_hint"
          defaultValue={defaultValues?.numberHint ?? ''}
          placeholder="4415"
        />
        <p className="text-xs text-muted-foreground">{t('numberHintHint')}</p>
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
  open,
  onOpenChange,
}: {
  account: Account | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('account')
  const [editing, setEditing] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

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
            <p className={`text-2xl font-bold tabular-nums text-focal ${account.balance < 0 ? 'text-destructive' : ''}`}>
              {formatTHB(account.balance)}
            </p>
            <p className="text-sm text-muted-foreground">
              {account.bank}
              {account.number_hint && ` · ${t('numberHint')} ${account.number_hint}`}
            </p>

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

            <Button className="w-full" onClick={() => setEditing(true)}>
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
}: {
  accounts: Account[]
}) {
  const t = useTranslations('account')
  const [addOpen, setAddOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailAccount = accounts.find((a) => a.id === detailId) ?? null

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button><Plus className="size-4 mr-2" />{t('add')}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('add')}</DialogTitle></DialogHeader>
          <AccountForm action={createAccount} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>{t('noAccounts')}</p>
          <p className="text-sm mt-1">{t('addFirst')}</p>
        </div>
      ) : (
        // Compact rows (design v3) — replaces the tall per-account cards with
        // 3 always-visible icon actions. Density budget: single line, amount
        // right/tabular; tap opens the detail sheet for edit/QR/delete.
        <div className="divide-y rounded-lg border">
          {accounts.map((acct) => (
            <button
              key={acct.id}
              type="button"
              onClick={() => setDetailId(acct.id)}
              className="flex w-full min-h-14 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{acct.name}</p>
                <Badge variant="secondary" className="mt-0.5 text-xs">{acct.bank}</Badge>
              </div>
              <p className={`shrink-0 text-sm font-semibold tabular-nums ${acct.balance < 0 ? 'text-destructive' : ''}`}>
                {formatTHB(acct.balance)}
              </p>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      <AccountDetailSheet
        account={detailAccount}
        open={detailId !== null}
        onOpenChange={(o) => { if (!o) setDetailId(null) }}
      />
    </div>
  )
}
