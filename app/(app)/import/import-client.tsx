'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertCircle, CheckCircle2, Clock, FileImage, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseSlipImage, type ParseStage } from '@/lib/slip/parse-image'
import { takeSharedSlip } from '@/lib/share-target'
import SlipConfirmForm from '@/components/slip-confirm-form'
import BatchSlipCard, { type BatchDoneAction } from '@/components/batch-slip-card'
import type { ParsedSlip } from '@/lib/slip/types'
import type { LastAccountMap } from '@/lib/last-account'

interface Account { id: string; name: string; bank: string }

interface Props {
  displayName: string | null
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
}

// Single-slip stages (unchanged from before)
type SingleStage = 'idle' | 'processing' | 'confirming' | 'error'

// Batch per-item state
type BatchItemStatus = 'pending' | 'parsing' | 'done' | 'error'

interface BatchItem {
  id: string
  filename: string
  status: BatchItemStatus
  progress: { stage: ParseStage | 'start'; percent: number }
  parsed: ParsedSlip | null
  parseError: string | null
  result: BatchDoneAction | null // set when user saves/skips
}

export default function ImportClient({ displayName, accounts, lastByCategory, globalLastAccountId }: Props) {
  const t = useTranslations('slip')
  const router = useRouter()

  // Single-slip state
  const [stage, setStage] = useState<SingleStage>('idle')
  const [progress, setProgress] = useState<{ stage: ParseStage | 'start'; percent: number }>({ stage: 'start', percent: 0 })
  const [slip, setSlip] = useState<ParsedSlip | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)

  // Batch state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [batchMode, setBatchMode] = useState<'queue' | 'reviewing' | null>(null)

  // Stable processFile for single-slip (used by share-target too)
  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setErrorMsg(t('pickImageFile'))
        setStage('error')
        return
      }
      setStage('processing')
      setProgress({ stage: 'start', percent: 2 })
      try {
        const parsed = await parseSlipImage(file, displayName, setProgress)
        setSlip(parsed)
        setStage('confirming')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t('genericError'))
        setStage('error')
      }
    },
    [displayName, t],
  )

  // Android Web Share Target: the SW stashed the shared image before
  // redirecting here — pick it up and parse immediately.
  useEffect(() => {
    let cancelled = false
    takeSharedSlip().then((file) => {
      if (file && !cancelled) processFile(file)
    })
    return () => { cancelled = true }
  }, [processFile])

  // Process a batch of files sequentially
  const processBatch = useCallback(
    async (files: File[]) => {
      const initial: BatchItem[] = files.map((f, i) => ({
        id: `${i}-${f.name}`,
        filename: f.name,
        status: 'pending',
        progress: { stage: 'start', percent: 0 },
        parsed: null,
        parseError: null,
        result: null,
      }))
      setBatchItems(initial)
      setBatchMode('queue')

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        // Mark as parsing
        setBatchItems((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: 'parsing', progress: { stage: 'start', percent: 2 } } : item,
          ),
        )

        if (!file.type.startsWith('image/')) {
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: 'error', parseError: t('pickImageFile') } : item,
            ),
          )
          continue
        }

        try {
          const parsed = await parseSlipImage(file, displayName, (prog) => {
            setBatchItems((prev) =>
              prev.map((item, idx) => idx === i ? { ...item, progress: prog } : item),
            )
          })
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: 'done', parsed } : item,
            ),
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('genericError')
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: 'error', parseError: msg } : item,
            ),
          )
        }
      }

      // All parsed — switch to review
      setBatchMode('reviewing')
    },
    [displayName, t],
  )

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    if (files.length === 1) {
      processFile(files[0])
    } else {
      processBatch(files)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    if (files.length === 1) {
      processFile(files[0])
    } else {
      processBatch(files)
    }
  }

  function resetToIdle() {
    setStage('idle')
    setSlip(null)
    setErrorMsg('')
    setBatchItems([])
    setBatchMode(null)
  }

  // ─── Single-slip confirm ───────────────────────────────────────────────────
  if (stage === 'confirming' && slip) {
    return (
      <SlipConfirmForm
        slip={slip}
        accounts={accounts}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
        onBack={resetToIdle}
        onSuccess={() => router.push('/transactions')}
      />
    )
  }

  // ─── Batch: queue (parsing in progress) ───────────────────────────────────
  if (batchMode === 'queue') {
    const doneCount = batchItems.filter((i) => i.status === 'done' || i.status === 'error').length
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t('batchQueueProcessing')}</h1>
          <p className="text-sm text-muted-foreground">{t('batchQueueHint', { current: doneCount, total: batchItems.length })}</p>
        </div>
        <div className="divide-y rounded-xl border">
          {batchItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              {item.status === 'pending' && <Clock className="size-4 shrink-0 text-muted-foreground" />}
              {item.status === 'parsing' && <Loader2 className="size-4 shrink-0 animate-spin text-primary" />}
              {item.status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-income" />}
              {item.status === 'error' && <AlertCircle className="size-4 shrink-0 text-destructive" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.filename}</p>
                {item.status === 'parsing' && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${item.progress.percent}%` }}
                    />
                  </div>
                )}
              </div>
              {item.status === 'parsing' && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.progress.percent}%</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">{t('privacyNote')}</p>
      </div>
    )
  }

  // ─── Batch: reviewing ─────────────────────────────────────────────────────
  if (batchMode === 'reviewing') {
    // Parse-error items auto-count as settled (no card → user can't interact with them)
    const allSettled = batchItems.every((item) => item.result !== null || item.status === 'error')

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t('batchTitle', { count: batchItems.length })}</h1>
          <p className="text-sm text-muted-foreground">{t('batchReviewHint')}</p>
        </div>

        {batchItems.map((item, idx) => {
          // Parse failed — show a static error card (no action needed, counts as settled)
          if (item.status === 'error' || !item.parsed) {
            return (
              <div key={item.id} className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0 text-destructive" />
                  <p className="truncate text-sm font-medium">{item.filename}</p>
                  <span className="ml-auto text-xs text-muted-foreground">{idx + 1}/{batchItems.length}</span>
                </div>
                <p className="pl-6 text-xs text-muted-foreground">{t('batchParseFailed')}</p>
                <p className="pl-6 text-xs text-muted-foreground">{t('batchParseFailedHint')}</p>
              </div>
            )
          }

          return (
            <BatchSlipCard
              key={item.id}
              index={idx}
              total={batchItems.length}
              filename={item.filename}
              slip={item.parsed}
              accounts={accounts}
              lastByCategory={lastByCategory}
              globalLastAccountId={globalLastAccountId}
              onDone={(action) =>
                setBatchItems((prev) =>
                  prev.map((bi) => (bi.id === item.id ? { ...bi, result: action } : bi)),
                )
              }
            />
          )
        })}

        {allSettled && (
          <Button className="w-full" onClick={() => router.push('/transactions')}>
            {t('batchDone')}
          </Button>
        )}

        <Button variant="outline" className="w-full" onClick={resetToIdle}>
          {t('importTitle')}
        </Button>
      </div>
    )
  }

  // ─── Single-slip: processing / error / idle ────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('importTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('importSubtitle')}</p>
      </div>

      {stage === 'idle' && (
        <label
          className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="rounded-full bg-muted p-4">
            <FileImage className="size-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">{t('dropHere')}</p>
            <p className="text-sm text-muted-foreground">{t('tapToPick')}</p>
          </div>
          {/* multiple: allows picking 1 or more files; 1 file → single flow, 2+ → batch */}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={onFileInput} />
        </label>
      )}

      {stage === 'processing' && (
        <div className="flex flex-col items-center gap-4 rounded-xl border p-8">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <div className="w-full space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t(`stage_${progress.stage}`)}</span>
              <span className="text-muted-foreground">{progress.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('privacyNote')}</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="space-y-3 rounded-xl border border-destructive/50 bg-destructive/5 p-6 text-center">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <p className="font-medium text-destructive">{errorMsg}</p>
          <Button variant="outline" onClick={resetToIdle}>
            {t('tryAgain')}
          </Button>
        </div>
      )}

      {stage === 'idle' && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Upload className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('supportedBanks')}</span>
        </div>
      )}
    </div>
  )
}
