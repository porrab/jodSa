'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { FileImage, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { RequiredMark } from '@/components/ui/required-mark'
import { addSessionSlip } from '@/app/actions/sessions'
import { parseSlipImage, type ParseStage } from '@/lib/slip/parse-image'
import { parseInputToSatang } from '@/lib/money'

type Mode = 'upload' | 'manual'

function toDatetimeLocal(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : ''
}

/**
 * Host-side add-slip: read a slip image on-device (same pipeline as the guest
 * /pay page) OR type the amount in by hand. Both paths insert a session_slip via
 * the owner action; the image never leaves the device.
 */
export default function AddSlipSheet({ sessionId }: { sessionId: string }) {
  const t = useTranslations('session')
  const ts = useTranslations('slip')
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('upload')
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState<{ stage: ParseStage | 'start'; percent: number }>({ stage: 'start', percent: 0 })
  const [amountInput, setAmountInput] = useState('')
  const [paidAtInput, setPaidAtInput] = useState('')
  const [refCode, setRefCode] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setMode('upload')
    setParsing(false)
    setProgress({ stage: 'start', percent: 0 })
    setAmountInput('')
    setPaidAtInput('')
    setRefCode(null)
  }

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(ts('pickImageFile'))
      return
    }
    setParsing(true)
    setProgress({ stage: 'start', percent: 2 })
    try {
      const parsed = await parseSlipImage(file, null, setProgress)
      setAmountInput(parsed.amount.value !== null ? (parsed.amount.value / 100).toFixed(2) : '')
      setPaidAtInput(parsed.datetime.value ? toDatetimeLocal(parsed.datetime.value) : '')
      setRefCode(parsed.refCode.value)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ts('genericError'))
    } finally {
      setParsing(false)
    }
  }, [ts])

  async function submit() {
    const amountSatang = parseInputToSatang(amountInput)
    if (amountSatang === null || amountSatang <= 0) {
      toast.error(t('targetInvalid'))
      return
    }
    if (!paidAtInput) {
      toast.error(t('paidAt'))
      return
    }
    setSubmitting(true)
    try {
      const result = await addSessionSlip(sessionId, {
        amount_satang: amountSatang,
        // Manual entry has no QR, so no ref. Only carry a ref the parser found.
        ref_code: mode === 'upload' ? refCode : null,
        paid_at: `${paidAtInput}:00+07:00`,
      })
      if (result.error === 'duplicate') {
        toast.error(t('addDuplicate'))
        return
      }
      if (result.error) {
        toast.error(t('addFailed'))
        return
      }
      toast.success(t('slipAdded'))
      setOpen(false)
      reset()
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  // Editable amount/time fields are shown once a slip has been parsed (upload)
  // or immediately in manual mode.
  const showFields = mode === 'manual' || amountInput !== '' || paidAtInput !== ''

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('addSlip')}</Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] space-y-4 overflow-y-auto px-4 pb-8">
        <SheetHeader><SheetTitle>{t('addSlipTitle')}</SheetTitle></SheetHeader>

        {/* Mode toggle */}
        <div className="flex gap-2">
          {(['upload', 'manual'] as const).map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setMode(m); if (m === 'manual') setRefCode(null) }}
              className={cn('flex-1', mode === m && 'border-primary bg-primary/10 text-primary')}
            >
              {m === 'upload' ? t('modeUpload') : t('modeManual')}
            </Button>
          ))}
        </div>

        {/* Upload dropzone / progress */}
        {mode === 'upload' && !showFields && (
          parsing ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border p-6">
              <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <div className="w-full space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{ts(`stage_${progress.stage}`)}</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{ts('privacyNote')}</p>
            </div>
          ) : (
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50">
              <FileImage className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium">{ts('pickSlip')}</span>
              <span className="text-xs text-muted-foreground">{ts('privacyNote')}</span>
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
          )
        )}

        {/* Editable fields + save */}
        {showFields && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-slip-amount">{t('amountLabel')} <RequiredMark /></Label>
              <Input
                id="add-slip-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-slip-paid-at">{t('paidAt')} <RequiredMark /></Label>
              <Input
                id="add-slip-paid-at"
                type="datetime-local"
                value={paidAtInput}
                onChange={(e) => setPaidAtInput(e.target.value)}
              />
            </div>
            {mode === 'upload' && refCode && (
              <p className="text-xs text-muted-foreground">{t('refCode', { ref: refCode })}</p>
            )}
            <Button className="w-full" onClick={submit} disabled={submitting}>
              {submitting ? ts('saving') : t('saveSlip')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
