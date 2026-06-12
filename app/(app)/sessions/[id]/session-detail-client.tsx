'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  ArrowLeft, Copy, ExternalLink, Trash2, CheckCircle2, Circle, Lock, LockOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { setSessionStatus, setSlipConfirmed, deleteSlip } from '@/app/actions/sessions'
import { formatTHB } from '@/lib/money'

type Session = {
  id: string
  title: string
  status: 'open' | 'closed'
  target_amount_satang: number | null
}

type Slip = {
  id: string
  amount_satang: number
  ref_code: string | null
  paid_at: string
  confirmed: boolean
}

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  })
}

export default function SessionDetailClient({
  session,
  slips,
  accountLabel,
  qrUrl,
}: {
  session: Session
  slips: Slip[]
  accountLabel: string
  qrUrl: string | null
}) {
  const t = useTranslations('session')
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  const payPath = `/pay/${session.id}`

  const recorded = slips.reduce((sum, s) => sum + s.amount_satang, 0)
  const confirmed = slips.filter((s) => s.confirmed).reduce((sum, s) => sum + s.amount_satang, 0)

  async function copyLink() {
    const url = `${window.location.origin}${payPath}`
    await navigator.clipboard.writeText(url)
    toast.success(t('linkCopied'))
  }

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

  async function toggleConfirm(slip: Slip) {
    try {
      await setSlipConfirmed(slip.id, session.id, !slip.confirmed)
    } catch {
      toast.error(t('slipStatusFailed'))
    }
  }

  async function handleDeleteSlip(slipId: string) {
    if (!confirm(t('deleteSlipConfirm'))) return
    try {
      await deleteSlip(slipId, session.id)
      toast.success(t('slipDeleted'))
    } catch {
      toast.error(t('slipDeleteFailed'))
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
          <p className="text-sm text-muted-foreground">{accountLabel}</p>
        </div>
        <Badge variant={session.status === 'open' ? 'secondary' : 'outline'}>
          {session.status === 'open' ? t('statusOpen') : t('statusClosed')}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('friendLink')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block truncate rounded bg-muted px-2 py-1.5 text-xs">{payPath}</code>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="size-3.5 mr-1.5" />{t('copy')}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={payPath} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5 mr-1.5" />{t('openView')}
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={toggleStatus} disabled={busy}>
                {session.status === 'open'
                  ? <><Lock className="size-3.5 mr-1.5" />{t('close')}</>
                  : <><LockOpen className="size-3.5 mr-1.5" />{t('reopen')}</>}
              </Button>
            </div>
            {qrUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt={t('qrAlt')} className="max-h-40 rounded-lg border" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('totals')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-lg font-semibold tabular-nums text-income">{t('confirmedAmount', { amount: formatTHB(confirmed) })}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{t('recordedTotal', { amount: formatTHB(recorded), count: slips.length })}</p>
            {session.target_amount_satang !== null && (
              <p className="text-sm tabular-nums text-muted-foreground">
                {t('targetLabel', { amount: formatTHB(session.target_amount_satang) })}
                {' · '}
                {confirmed >= session.target_amount_satang
                  ? t('targetReached')
                  : t('targetShortBy', { amount: formatTHB(session.target_amount_satang - confirmed) })}
              </p>
            )}
            <p className="pt-1 text-xs text-muted-foreground">{t('notVerifiedHint')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">{t('recordedSlips')}</h2>
        {slips.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('noSlips')}
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {slips.map((slip) => (
              <div key={slip.id} className="flex items-center gap-3 p-3">
                {slip.confirmed
                  ? <CheckCircle2 className="size-5 shrink-0 text-income" />
                  : <Circle className="size-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular-nums">{formatTHB(slip.amount_satang)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDateTime(slip.paid_at, locale)}
                    {slip.ref_code && ` · ${t('refCode', { ref: slip.ref_code })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={slip.confirmed}
                    onCheckedChange={() => toggleConfirm(slip)}
                    aria-label={t('confirmSlipAria')}
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteSlip(slip.id)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
