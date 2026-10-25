'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, Lock, LockOpen, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import ShareLink from '@/components/share-link'
import TripClient from '@/app/pay/[token]/trip-client'
import { setSessionStatus, deleteSession, addTripExpenseAsOwner } from '@/app/actions/sessions'
import { formatTHB } from '@/lib/money'
import {
  computeTripDebts,
  type Participant as TripParticipant,
  type Expense as TripExpense,
  type Slip as TripSlip,
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
  const tt = useTranslations('trip')
  const tc = useTranslations('common')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const payPath = `/pay/${session.id}`

  // J5 — the trip home's focal element: "ใครติดใคร เท่าไหร่", reusing the M6
  // settlement math (computeTripDebts wraps perHead — see lib/trip.ts).
  const nicknameOf = (id: string) => ledger.participants.find((p) => p.id === id)?.nickname ?? '—'
  const debts = computeTripDebts(ledger.participants, ledger.expenses, ledger.slips)

  async function toggleStatus() {
    setBusy(true)
    try {
      await setSessionStatus(session.id, session.status === 'open' ? 'closed' : 'open')
      toast.success(session.status === 'open' ? tt('closeTrip') : tt('reopenTrip'))
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
          <h1 className="truncate text-[28px] font-bold leading-[1.7]">{session.title}</h1>
          <p className="text-sm text-muted-foreground">{tt('members', { count: ledger.participants.length })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline">{t('tripBadge')}</Badge>
          <Badge variant={session.status === 'open' ? 'secondary' : 'outline'}>
            {session.status === 'open' ? t('statusOpen') : t('statusClosed')}
          </Badge>
        </div>
      </div>

      {/* J5 — trip home is ledger-focal: "ใครติดใคร เท่าไหร่" front and center,
          not the expense list. One accent (the amount), flat surface. */}
      <section className="space-y-3 border-y border-border py-4">
          <h2 className="text-sm font-medium text-muted-foreground">{tt('debtsHeading')}</h2>
          {debts.length === 0 ? (
            <p className="text-sm font-medium text-income">{tt('allSettled')}</p>
          ) : (
            <div className="space-y-2">
              {debts.map((d) => (
                <div key={`${d.fromId}>${d.toId}`} className="flex items-center justify-between text-sm">
                  <span>{tt('debtLine', { from: nicknameOf(d.fromId), to: nicknameOf(d.toId) })}</span>
                  <span className="font-semibold tabular-nums text-expense">{formatTHB(d.amountSatang)}</span>
                </div>
              ))}
            </div>
          )}
      </section>

      <section className="space-y-3 border-b border-border pb-4">
          <h2 className="text-sm font-medium text-muted-foreground">{t('friendLink')}</h2>
          <ShareLink path={payPath} title={session.title} />
      </section>

      <TripClient
        token={session.id}
        title={session.title}
        ledger={ledger}
        seed={seed}
        embedded
        ownerAccounts={accountsWithQr.map((a) => ({ id: a.id, label: `${a.name} (${a.bank})` }))}
        onOwnerAddExpense={(fd) => addTripExpenseAsOwner(session.id, fd)}
      />

      <Button variant="outline" onClick={toggleStatus} disabled={busy} className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive">
        {session.status === 'open'
          ? <><Lock className="size-3.5 mr-1.5" />{tt('closeTrip')}</>
          : <><LockOpen className="size-3.5 mr-1.5" />{tt('reopenTrip')}</>}
      </Button>

      <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
        <Trash2 className="size-3.5 mr-1.5" />{tc('delete')}
      </Button>
    </div>
  )
}
