'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Upload, FileImage, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseSlipImage, type ParseStage } from '@/lib/slip/parse-image'
import { takeSharedSlip } from '@/lib/share-target'
import SlipConfirmForm from '@/components/slip-confirm-form'
import type { ParsedSlip } from '@/lib/slip/types'
import type { LastAccountMap } from '@/lib/last-account'

interface Account {
  id: string
  name: string
  bank: string
}

interface Props {
  displayName: string | null
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
}

type Stage = 'idle' | 'processing' | 'confirming' | 'error'

export default function ImportClient({ displayName, accounts, lastByCategory, globalLastAccountId }: Props) {
  const t = useTranslations('slip')
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState<{ stage: ParseStage | 'start'; percent: number }>({ stage: 'start', percent: 0 })
  const [slip, setSlip] = useState<ParsedSlip | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)

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

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = '' // allow re-selecting same file
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  if (stage === 'confirming' && slip) {
    return (
      <SlipConfirmForm
        slip={slip}
        accounts={accounts}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
        onBack={() => setStage('idle')}
        onSuccess={() => router.push('/transactions')}
      />
    )
  }

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
          <input type="file" accept="image/*" className="sr-only" onChange={onFileInput} />
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
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-6 text-center space-y-3">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <p className="font-medium text-destructive">{errorMsg}</p>
          <Button variant="outline" onClick={() => setStage('idle')}>
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
