'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
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
  qr_image_path: string | null
  qrUrl: string | null
}

function AccountForm({
  defaultValues,
  action,
  onSuccess,
}: {
  defaultValues?: { name: string; bank: string; id?: string }
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
        <Label htmlFor="name">{t('name')}</Label>
        <Input id="name" name="name" defaultValue={defaultValues?.name} required />
      </div>
      <div className="space-y-1">
        <Label>{t('bank')}</Label>
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
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  )
}

function QrDialog({ account, onClose }: { account: Account; onClose: () => void }) {
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

export default function AccountsClient({
  accounts,
}: {
  accounts: Account[]
}) {
  const t = useTranslations('account')
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [qrId, setQrId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    try {
      await deleteAccount(id)
      toast.success(t('deleted'))
    } catch {
      toast.error(t('deleteFailed'))
    }
  }

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
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((acct) => {
            return (
              <Card key={acct.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{acct.name}</span>
                    <div className="flex gap-1">
                      <Dialog open={editId === acct.id} onOpenChange={(o) => setEditId(o ? acct.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <Pencil className="size-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>{t('edit')}</DialogTitle></DialogHeader>
                          <AccountForm
                            defaultValues={{ id: acct.id, name: acct.name, bank: acct.bank }}
                            action={updateAccount}
                            onSuccess={() => setEditId(null)}
                          />
                        </DialogContent>
                      </Dialog>
                      <Dialog open={qrId === acct.id} onOpenChange={(o) => setQrId(o ? acct.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t('qrAriaLabel')}>
                            <QrCode className={`size-3.5 ${acct.qr_image_path ? 'text-primary' : ''}`} />
                          </Button>
                        </DialogTrigger>
                        <QrDialog account={acct} onClose={() => setQrId(null)} />
                      </Dialog>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(acct.id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary" className="mb-2">{acct.bank}</Badge>
                  <p className={`text-lg font-semibold tabular-nums ${acct.balance < 0 ? 'text-destructive' : ''}`}>
                    {formatTHB(acct.balance)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
