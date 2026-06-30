'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, Lock, LockOpen, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ShareLink from '@/components/share-link'
import TripClient from '@/app/pay/[token]/trip-client'
import { setSessionStatus, deleteSession, addTripExpenseAsOwner } from '@/app/actions/sessions'
import type {
  Participant as TripParticipant,
  Expense as TripExpense,
  Slip as TripSlip,
} from '@/lib/trip'

type Ledger = {
  participants: TripParticipant[]
  expenses: TripExpense[]
  slips: TripSlip[]
  qrByExpense: Record<string, string | null>
}
type Seed = { participantId: string; participantToken: string; nickname: string }

// Owner-side management of a trip session. Owner controls (share, close, delete)
// sit on top; the ledger itself reuses the public TripClient, seeded with the
// owner's participant identity so they act through the same UI + API routes.
export default function TripManageClient({
  session, ledger, seed, accountsWithQr,
}: {
  session: { id: string; title: string; status: 'open' | 'closed' }
  ledger: Ledger
  seed: Seed | null
  accountsWithQr: { id: string; name: string; bank: string }[]
}) {
  const t = useTranslations('session')
  const tc = useTranslations('common')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const payPath = `/pay/${session.id}`

  async function toggleStatus() {
    setBusy(true)
    try {
      await setSessionStatus(session.id, session.status === 'open' ? 'closed' : 'open')
      toast.success(session.status === 'open' ? t('closedToast') : t('reopenedToast'))
    } catch {
      toast.error(t('statusFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirm(t('deleteConfirm'))) return
    try {
      await deleteSession(session.id)
      toast.success(t('deleted'))
      router.push('/sessions')
    } catch {
      toast.error(t('deleteFailed'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href="/sessions" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> {t('title')}
          </Link>
          <h1 className="truncate text-2xl font-bold">{session.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline">{t('tripBadge')}</Badge>
          <Badge variant={session.status === 'open' ? 'secondary' : 'outline'}>
            {session.status === 'open' ? t('statusOpen') : t('statusClosed')}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('friendLink')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ShareLink path={payPath} title={session.title} />
          <Button variant="outline" size="sm" onClick={toggleStatus} disabled={busy}>
            {session.status === 'open'
              ? <><Lock className="size-3.5 mr-1.5" />{t('close')}</>
              : <><LockOpen className="size-3.5 mr-1.5" />{t('reopen')}</>}
          </Button>
        </CardContent>
      </Card>

      <TripClient
        token={session.id}
        title={session.title}
        ledger={ledger}
        seed={seed}
        embedded
        ownerAccounts={accountsWithQr.map((a) => ({ id: a.id, label: `${a.name} (${a.bank})` }))}
        onOwnerAddExpense={(fd) => addTripExpenseAsOwner(session.id, fd)}
      />

      <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
        <Trash2 className="size-3.5 mr-1.5" />{tc('delete')}
      </Button>
    </div>
  )
}
