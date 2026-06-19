'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronRight, HandCoins, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createSession, deleteSession } from '@/app/actions/sessions'
import { formatTHB, parseInputToSatang } from '@/lib/money'
import { cn } from '@/lib/utils'

type SessionItem = {
  id: string
  title: string
  status: 'open' | 'closed'
  type: 'collect' | 'trip'
  target_amount_satang: number | null
  recorded: number
  confirmed: number
  count: number
}

type AccountOption = {
  id: string
  name: string
  bank: string
  qr_image_path: string | null
}

function CreateSessionForm({
  accounts,
  onSuccess,
}: {
  accounts: AccountOption[]
  onSuccess: () => void
}) {
  const t = useTranslations('session')
  const [type, setType] = useState<'collect' | 'trip'>('collect')
  const [accountId, setAccountId] = useState('')
  const withQr = accounts.filter((a) => a.qr_image_path)

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('type', type)
      if (type === 'collect') {
        fd.set('account_id', accountId)
        const target = fd.get('target_amount') as string
        if (target.trim()) {
          const satang = parseInputToSatang(target)
          if (satang === null || satang <= 0) {
            toast.error(t('targetInvalid'))
            return prev
          }
          fd.set('target_amount_satang', String(satang))
        }
      }
      fd.delete('target_amount')
      const result = await createSession(prev, fd)
      if (!result.error) onSuccess()
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  const noQr = type === 'collect' && withQr.length === 0

  return (
    <form action={formAction} className="space-y-4">
      {/* Type: collect into one account vs. a shared trip ledger */}
      <div className="space-y-1.5">
        <Label>{t('typeLabel')}</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['collect', 'trip'] as const).map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setType(ty)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                type === ty ? 'border-primary bg-primary/10' : 'hover:bg-accent',
              )}
            >
              <span className="block text-sm font-medium">
                {ty === 'collect' ? t('typeCollect') : t('typeTrip')}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {ty === 'collect' ? t('typeCollectHint') : t('typeTripHint')}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">{t('name')} <RequiredMark /></Label>
        <Input id="title" name="title" required placeholder={t('namePlaceholder')} />
      </div>

      {type === 'collect' && (
        noQr ? (
          <p className="text-sm text-muted-foreground">
            {t('noQrPrefix')}{' '}
            <Link href="/accounts" className="underline">{t('noQrLink')}</Link>{' '}
            {t('noQrSuffix')}
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>{t('receivingAccount')} <RequiredMark /></Label>
              <Select value={accountId} onValueChange={setAccountId} required>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectAccount')} />
                </SelectTrigger>
                <SelectContent>
                  {withQr.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.bank})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target_amount">{t('targetOptional')}</Label>
              <Input id="target_amount" name="target_amount" type="text" inputMode="decimal" placeholder={t('targetPlaceholder')} />
            </div>
          </>
        )
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button
        type="submit"
        className="w-full"
        disabled={isPending || noQr || (type === 'collect' && !accountId)}
      >
        {isPending ? t('creating') : t('createLink')}
      </Button>
    </form>
  )
}

export default function SessionsClient({
  sessions,
  accounts,
}: {
  sessions: SessionItem[]
  accounts: AccountOption[]
}) {
  const t = useTranslations('session')
  const [addOpen, setAddOpen] = useState(false)

  async function handleDelete(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    try {
      await deleteSession(id)
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
          <DialogHeader><DialogTitle>{t('addTitle')}</DialogTitle></DialogHeader>
          <CreateSessionForm accounts={accounts} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <HandCoins className="mx-auto mb-2 size-6" />
          <p>{t('empty')}</p>
          <p className="text-sm mt-1">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center gap-2 py-4">
                <Link href={`/sessions/${s.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{s.title}</span>
                    {s.status === 'closed' && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="mt-1 text-sm tabular-nums">
                    <span className="text-income">{formatTHB(s.confirmed)}</span>
                    <span className="text-muted-foreground"> / {t('recordedAmount', { amount: formatTHB(s.recorded) })}</span>
                    {s.target_amount_satang !== null && (
                      <span className="text-muted-foreground"> · {t('targetAmount', { amount: formatTHB(s.target_amount_satang) })}</span>
                    )}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {s.type === 'trip' && <Badge variant="outline">{t('tripBadge')}</Badge>}
                    <Badge variant={s.status === 'open' ? 'secondary' : 'outline'}>
                      {s.status === 'open' ? t('statusOpen') : t('statusClosed')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{t('slipCount', { count: s.count })}</span>
                  </div>
                </Link>
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(s.id)}>
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
