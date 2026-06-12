'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle2, FileImage, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseSlipImage, type ParseStage } from '@/lib/slip/parse-image'
import { formatTHB, parseInputToSatang } from '@/lib/money'
import type { ParsedSlip } from '@/lib/slip/types'

type SubmittedSlip = {
  amount_satang: number
  ref_code: string | null
  paid_at: string
}

type Stage = 'idle' | 'processing' | 'confirming' | 'error'

// Session persistence across browser restarts: the token lives in the URL and
// the guest's own submissions live in localStorage keyed by token.
const slipsKey = (token: string) => `jodsa:pay:${token}:slips`

function loadSubmitted(token: string): SubmittedSlip[] {
  try {
    return JSON.parse(localStorage.getItem(slipsKey(token)) ?? '[]')
  } catch {
    return []
  }
}

function toDatetimeLocal(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : ''
}

export default function PayClient({
  token,
  session,
  qrUrl,
}: {
  token: string
  session: { title: string; targetAmountSatang: number | null } | null
  qrUrl: string | null
}) {
  const t = useTranslations('pay')
  const ts = useTranslations('slip')
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState<{ stage: ParseStage | 'start'; percent: number }>({ stage: 'start', percent: 0 })
  const [slip, setSlip] = useState<ParsedSlip | null>(null)
  const [amountInput, setAmountInput] = useState('')
  const [paidAtInput, setPaidAtInput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<SubmittedSlip[]>([])

  useEffect(() => {
    setSubmitted(loadSubmitted(token))
    localStorage.setItem('jodsa:pay:last-token', token)
  }, [token])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg(ts('pickImageFile'))
      setStage('error')
      return
    }
    setStage('processing')
    setProgress({ stage: 'start', percent: 2 })
    try {
      const parsed = await parseSlipImage(file, null, setProgress)
      setSlip(parsed)
      setAmountInput(parsed.amount.value !== null ? (parsed.amount.value / 100).toFixed(2) : '')
      setPaidAtInput(parsed.datetime.value ? toDatetimeLocal(parsed.datetime.value) : '')
      setStage('confirming')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : ts('genericError'))
      setStage('error')
    }
  }, [ts])

  async function submitSlip() {
    if (!slip) return
    const amountSatang = parseInputToSatang(amountInput)
    if (amountSatang === null || amountSatang <= 0) {
      toast.error(t('amountInvalid'))
      return
    }
    if (!paidAtInput) {
      toast.error(t('paidAtRequired'))
      return
    }
    setSubmitting(true)
    try {
      const payload: SubmittedSlip = {
        amount_satang: amountSatang,
        ref_code: slip.refCode.value,
        paid_at: `${paidAtInput}:00+07:00`,
      }
      const res = await fetch(`/api/sessions/${token}/slips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 409) {
        toast.error(t('duplicateSlip'))
        return
      }
      if (res.status === 429) {
        toast.error(t('rateLimited'))
        return
      }
      if (!res.ok) {
        toast.error(t('submitFailed'))
        return
      }
      const next = [...submitted, payload]
      setSubmitted(next)
      localStorage.setItem(slipsKey(token), JSON.stringify(next))
      setSlip(null)
      setStage('idle')
      toast.success(t('slipSaved'))
    } catch {
      toast.error(t('networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{t('notFound')}</h1>
        <p className="text-sm text-muted-foreground">{t('notFoundHint')}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-10">
      <header className="space-y-1 pt-4 text-center">
        <p className="text-sm text-muted-foreground">{t('brand')}</p>
        <h1 className="text-2xl font-bold">{session.title}</h1>
        {session.targetAmountSatang !== null && (
          <p className="text-sm text-muted-foreground">
            {t('target', { amount: formatTHB(session.targetAmountSatang) })}
          </p>
        )}
      </header>

      {qrUrl && stage === 'idle' && (
        <section className="space-y-2 rounded-xl border p-4 text-center">
          <p className="text-sm font-medium">{t('step1')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt={t('qrAlt')} className="mx-auto max-h-72 rounded-lg" />
        </section>
      )}

      {stage === 'idle' && (
        <section className="space-y-2">
          <p className="text-sm font-medium">{t('step2')}</p>
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50">
            <FileImage className="size-7 text-muted-foreground" />
            <span className="text-sm font-medium">{t('pickSlip')}</span>
            <span className="text-xs text-muted-foreground">{t('privacyShort')}</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) processFile(file)
                e.target.value = ''
              }}
            />
          </label>
        </section>
      )}

      {stage === 'processing' && (
        <section className="flex flex-col items-center gap-4 rounded-xl border p-8">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <div className="w-full space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{ts(`stage_${progress.stage}`)}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{ts('privacyNote')}</p>
        </section>
      )}

      {stage === 'confirming' && slip && (
        <section className="space-y-4 rounded-xl border p-4">
          <p className="font-medium">{t('reviewBeforeSend')}</p>
          <div className="space-y-1.5">
            <Label htmlFor="guest-amount">{ts('amountLabel')}</Label>
            <Input
              id="guest-amount"
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className={slip.amount.confidence < 0.5 ? 'border-amber-500' : ''}
            />
            {slip.amount.confidence < 0.5 && (
              <p className="text-xs text-amber-600">{t('unclearRead')}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-paid-at">{t('paidAt')}</Label>
            <Input
              id="guest-paid-at"
              type="datetime-local"
              value={paidAtInput}
              onChange={(e) => setPaidAtInput(e.target.value)}
            />
          </div>
          {slip.refCode.value && (
            <p className="text-xs text-muted-foreground">{t('refLabel', { ref: slip.refCode.value })}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setSlip(null); setStage('idle') }}>
              {t('back')}
            </Button>
            <Button className="flex-1" onClick={submitSlip} disabled={submitting}>
              {submitting ? t('sending') : t('sendSlip')}
            </Button>
          </div>
        </section>
      )}

      {stage === 'error' && (
        <section className="space-y-3 rounded-xl border border-destructive/50 bg-destructive/5 p-6 text-center">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <p className="font-medium text-destructive">{errorMsg}</p>
          <Button variant="outline" onClick={() => setStage('idle')}>{ts('tryAgain')}</Button>
        </section>
      )}

      {submitted.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium">{t('yourSlips')}</p>
          <div className="divide-y rounded-lg border">
            {submitted.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <CheckCircle2 className="size-4 shrink-0 text-income" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular-nums">{formatTHB(s.amount_satang)}</p>
                  {s.ref_code && (
                    <p className="truncate text-xs text-muted-foreground">{t('refShort', { ref: s.ref_code })}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <Upload className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {t.rich('recordedNote', { strong: (chunks) => <strong>{chunks}</strong> })}
        </span>
      </footer>
    </main>
  )
}
