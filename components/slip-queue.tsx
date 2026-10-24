'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileImage, Loader2, Plus, RotateCcw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import SlipConfirmForm from '@/components/slip-confirm-form'
import TransactionForm from '@/components/transaction-form'
import { parseSlipImage, type ParseStage } from '@/lib/slip/parse-image'
import { checkNullRefDedup, checkRefCodeDuplicate, createTransaction } from '@/app/actions/transactions'
import { resolveAccountDefault, type LastAccountMap } from '@/lib/last-account'
import type { TxFormValues } from '@/lib/quick-add'
import type { ParsedSlip } from '@/lib/slip/types'

type Account = { id: string; name: string; bank: string; number_hint?: string | null }
type QueueStatus = 'pending' | 'parsing' | 'ready' | 'review' | 'error' | 'saving' | 'saved' | 'save_error'
type QueueItem = {
  id: string
  filename: string
  file: File | null
  status: QueueStatus
  progress: { stage: ParseStage | 'start'; percent: number }
  parsed: ParsedSlip | null
  accountId: string | null
  duplicate: boolean
  error: string | null
}

const LOW_CONFIDENCE = 0.7

function makeItem(file: File): QueueItem {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${file.name}-${Math.random()}`,
    filename: file.name,
    file,
    status: 'pending',
    progress: { stage: 'start', percent: 0 },
    parsed: null,
    accountId: null,
    duplicate: false,
    error: null,
  }
}

export default function SlipQueue({
  initialFiles = [],
  displayName,
  accounts,
  lastByCategory,
  globalLastAccountId,
  variant = 'page',
  onUnsavedCountChange,
  onSingleSaved,
}: {
  initialFiles?: File[]
  displayName: string | null
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
  variant?: 'sheet' | 'page'
  onUnsavedCountChange?: (count: number) => void
  onSingleSaved?: () => void
}) {
  const t = useTranslations('slip')
  const locale = useLocale()
  const router = useRouter()
  const [items, setItems] = useState<QueueItem[]>(() => initialFiles.map(makeItem))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [manualId, setManualId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const processing = useRef(false)
  const addInputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const resolveAccount = useCallback((slip: ParsedSlip) => {
    const code = slip.bankCode.value?.toLowerCase()
    const parsedAccountId = code ? accounts.find((account) => account.bank.toLowerCase() === code)?.id ?? null : null
    return resolveAccountDefault({
      category: undefined,
      lastByCategory,
      globalLastAccountId,
      parsedAccountId,
      fallbackAccountId: accounts[0]?.id ?? null,
    })
  }, [accounts, globalLastAccountId, lastByCategory])

  const classify = useCallback(async (slip: ParsedSlip) => {
    const accountId = resolveAccount(slip)
    const missingRequired = !slip.amount.value || !slip.datetime.value || !accountId
    const lowConfidence = [slip.amount, slip.datetime, slip.counterparty].some((field) => field.confidence < LOW_CONFIDENCE)
    let duplicate = false

    if (slip.refCode.value) {
      duplicate = !!(await checkRefCodeDuplicate(slip.refCode.value)).duplicate
    } else if (slip.amount.value && slip.datetime.value && accountId) {
      duplicate = (await checkNullRefDedup(accountId, slip.amount.value, slip.datetime.value)).duplicates.length > 0
    }

    return {
      accountId,
      duplicate,
      status: missingRequired || lowConfidence || duplicate ? 'review' as const : 'ready' as const,
    }
  }, [resolveAccount])

  useEffect(() => {
    const unsaved = items.filter((item) => item.status !== 'saved').length
    onUnsavedCountChange?.(unsaved)
  }, [items, onUnsavedCountChange])

  useEffect(() => {
    if (processing.current) return
    const next = items.find((item) => item.status === 'pending' && item.file)
    if (!next?.file) return
    processing.current = true
    const file = next.file
    setItems((current) => current.map((item) => item.id === next.id
      ? { ...item, status: 'parsing', progress: { stage: 'start', percent: 2 } }
      : item))

    void (async () => {
      try {
        if (!file.type.startsWith('image/')) throw new Error(t('pickImageFile'))
        const parsed = await parseSlipImage(file, displayName, (progress) => {
          setItems((current) => current.map((item) => item.id === next.id ? { ...item, progress } : item))
        })
        const verdict = await classify(parsed)
        setItems((current) => current.map((item) => item.id === next.id
          ? { ...item, parsed, ...verdict, error: null }
          : item))
        if (items.length === 1) setSelectedId(next.id)
      } catch (error) {
        setItems((current) => current.map((item) => item.id === next.id
          ? { ...item, status: 'error', error: error instanceof Error ? error.message : t('genericError') }
          : item))
      } finally {
        processing.current = false
        setItems((current) => [...current])
      }
    })()
  }, [classify, displayName, items, t])

  function addFiles(files: File[]) {
    if (files.length === 0) return
    setItems((current) => [...current, ...files.map(makeItem)])
  }

  function onFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  function manualPrefill(item: QueueItem): TxFormValues {
    return {
      amount: item.parsed?.amount.value ? (item.parsed.amount.value / 100).toFixed(2) : undefined,
      account_id: item.accountId ?? undefined,
      counterparty: item.parsed?.counterparty.value ?? undefined,
      datetime: item.parsed?.datetime.value ?? undefined,
    }
  }

  async function saveReady() {
    const ready = items.filter((item) => item.status === 'ready' && item.parsed && item.accountId)
    if (ready.length === 0) {
      const firstReview = items.find((item) => item.status === 'review' || item.status === 'save_error')
      if (firstReview) setSelectedId(firstReview.id)
      return
    }

    for (const item of ready) {
      const slip = item.parsed!
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: 'saving' } : row))
      const formData = new FormData()
      formData.set('type', slip.suggestedType)
      formData.set('account_id', item.accountId!)
      formData.set('amount', (slip.amount.value! / 100).toFixed(2))
      formData.set('datetime', slip.datetime.value!)
      if (slip.counterparty.value) formData.set('counterparty', slip.counterparty.value)
      if (slip.refCode.value) formData.set('ref_code', slip.refCode.value)
      if (slip.bankCode.value) formData.set('bank_code', slip.bankCode.value)
      const result = await createTransaction({ error: '' }, formData)
      setItems((current) => current.map((row) => row.id === item.id
        ? { ...row, status: result.error ? 'save_error' : 'saved', error: result.error || null, file: result.error ? row.file : null }
        : row))
    }
    router.refresh()
  }

  const selected = items.find((item) => item.id === selectedId) ?? null
  if (selected && manualId === selected.id) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" onClick={() => {
          setManualId(null)
          setSelectedId(null)
          requestAnimationFrame(() => itemRefs.current[selected.id]?.focus())
        }}>
          <ChevronLeft aria-hidden="true" className="mr-1 size-4" />{t('queueBack', { count: items.length })}
        </Button>
        <TransactionForm
          accounts={accounts}
          lastByCategory={lastByCategory}
          globalLastAccountId={globalLastAccountId}
          defaultValues={manualPrefill(selected)}
          stickySubmit={variant === 'sheet'}
          idPrefix={`slip-manual-${selected.id}`}
          onSuccess={() => {
            setItems((current) => current.map((item) => item.id === selected.id
              ? { ...item, status: 'saved', file: null, error: null }
              : item))
            router.refresh()
            setManualId(null)
            if (items.length === 1) onSingleSaved?.()
            else setSelectedId(null)
          }}
        />
      </div>
    )
  }
  if (selected?.parsed) {
    return (
      <SlipConfirmForm
        slip={selected.parsed}
        accounts={accounts}
        lastByCategory={lastByCategory}
        globalLastAccountId={globalLastAccountId}
        stickySubmit={variant === 'sheet'}
        onBack={() => {
          setSelectedId(null)
          requestAnimationFrame(() => itemRefs.current[selected.id]?.focus())
        }}
        onSuccess={() => {
          setItems((current) => current.map((item) => item.id === selected.id
            ? { ...item, status: 'saved', file: null, error: null }
            : item))
          router.refresh()
          if (items.length === 1) onSingleSaved?.()
          else setSelectedId(null)
        }}
      />
    )
  }

  const readyCount = items.filter((item) => item.status === 'ready').length
  const reviewCount = items.filter((item) => item.status === 'review' || item.status === 'save_error').length
  const readCount = items.filter((item) => !['pending', 'parsing'].includes(item.status)).length
  const statusLabel = (item: QueueItem) => t(`queueStatus_${item.status}`)
  const statusTone = (status: QueueStatus): 'success' | 'warning' | 'destructive' | 'info' | 'neutral' => {
    if (status === 'ready' || status === 'saved') return 'success'
    if (status === 'review') return 'warning'
    if (status === 'error' || status === 'save_error') return 'destructive'
    if (status === 'parsing' || status === 'saving') return 'info'
    return 'neutral'
  }
  const amountLabel = (item: QueueItem) => item.parsed?.amount.value
    ? new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', { style: 'currency', currency: 'THB' }).format(item.parsed.amount.value / 100)
    : ''
  const rowMeta = (item: QueueItem) => {
    if (!item.parsed?.datetime.value) return item.status === 'error' ? t('batchParseFailed') : t('queueStatus_pending')
    const date = new Date(item.parsed.datetime.value).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok',
    })
    const account = accounts.find((candidate) => candidate.id === item.accountId)?.name
    return account ? `${date} · ${account}` : date
  }

  if (items.length === 0) {
    return (
      <label
        className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors"
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)) }}
        data-dragging={dragging || undefined}
      >
        <FileImage className="size-8 text-muted-foreground" />
        <span className="font-medium">{t('dropHere')}</span>
        <span className="text-sm text-muted-foreground">{t('tapToPick')}</span>
        <input type="file" accept="image/*" multiple className="sr-only" onChange={onFileInput} />
      </label>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{t('queueHeader', { count: items.length, read: readCount })}</p>
          {items.length > 20 && <p className="text-sm text-warn">{t('queueLongWait')}</p>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => addInputRef.current?.click()}>
          <Plus aria-hidden="true" className="mr-1 size-4" />{t('queueAdd')}
        </Button>
        <input ref={addInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onFileInput} />
      </div>
      <p className="text-sm text-muted-foreground">{t('privacyNote')}</p>
      <p className="sr-only" aria-live="polite">{t('queueHeader', { count: items.length, read: readCount })}</p>

      <div role="list" className="divide-y divide-border">
        {items.map((item, index) => (
          <div role="listitem" key={item.id} className="p-3">
            <button
              ref={(node) => { itemRefs.current[item.id] = node }}
              type="button"
              disabled={!item.parsed || item.status === 'saved' || item.status === 'saving'}
              onClick={() => setSelectedId(item.id)}
              aria-label={t('queueItemA11y', {
                index: index + 1,
                status: statusLabel(item),
                amount: amountLabel(item),
                duplicate: item.duplicate ? t('queueDuplicate') : '',
              })}
              className="flex w-full items-center gap-3 text-left disabled:cursor-default"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <Badge variant={statusTone(item.status)}>
                    {item.status === 'parsing' || item.status === 'saving'
                      ? <Loader2 aria-hidden="true" className="animate-spin" />
                      : item.status === 'ready' || item.status === 'saved'
                        ? <CheckCircle2 aria-hidden="true" />
                        : item.status === 'review' || item.status === 'error' || item.status === 'save_error'
                          ? <AlertTriangle aria-hidden="true" />
                          : null}
                    {statusLabel(item)}
                  </Badge>
                  <span>{amountLabel(item)}{item.parsed?.counterparty.value ? ` · ${item.parsed.counterparty.value}` : ''}</span>
                </span>
                <span className="block truncate text-sm text-muted-foreground">{rowMeta(item)}</span>
                {item.status === 'parsing' && (
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full w-full origin-left bg-primary transition-transform" style={{ transform: `scaleX(${item.progress.percent / 100})` }} />
                  </span>
                )}
              </span>
              {item.parsed && !['saved', 'saving'].includes(item.status) && <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />}
            </button>

            {(item.status === 'error' || item.status === 'save_error') && (
              <div className="mt-2 flex flex-wrap gap-2 pl-7">
                <Button asChild type="button" variant="outline" size="sm">
                  <label>
                    <RotateCcw aria-hidden="true" className="mr-1 size-3.5" />{t('queueReplace')}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) setItems((current) => current.map((row) => row.id === item.id ? makeItem(file) : row))
                      }}
                    />
                  </label>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedId(item.id); setManualId(item.id) }}>
                  {t('queueManual')}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {(readyCount > 0 || reviewCount > 0) && <div className={variant === 'sheet' ? 'sticky bottom-0 bg-background pt-2' : ''}>
        <Button className="w-full" onClick={saveReady} disabled={items.some((item) => item.status === 'saving')}>
          {readyCount > 0 ? t('queueSaveReady', { count: readyCount }) : t('queueReviewRemaining', { count: reviewCount })}
        </Button>
      </div>}
    </div>
  )
}
