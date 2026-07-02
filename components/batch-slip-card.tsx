'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CategoryLabel } from '@/lib/categories'
import { AlertTriangle, CheckCircle2, Info, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createTransaction, checkNullRefDedup } from '@/app/actions/transactions'
import { parseInputToSatang } from '@/lib/money'
import { CATEGORIES } from '@/lib/validators/transaction'
import { resolveAccountDefault, type LastAccountMap } from '@/lib/last-account'
import { cn } from '@/lib/utils'
import type { ParsedSlip } from '@/lib/slip/types'

interface Account { id: string; name: string; bank: string }

const LOW_CONF = 0.7

function toDatetimeLocal(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : ''
}

export type BatchDoneAction = 'saved' | 'skipped'

export default function BatchSlipCard({
  index,
  total,
  filename,
  slip,
  accounts,
  lastByCategory,
  globalLastAccountId,
  onDone,
}: {
  index: number
  total: number
  filename: string
  slip: ParsedSlip
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
  onDone: (action: BatchDoneAction) => void
}) {
  const t = useTranslations('slip')
  const locale = useLocale()

  const parsedAccountId = (() => {
    const code = slip.bankCode.value?.toLowerCase()
    return code ? accounts.find((a) => a.bank.toLowerCase() === code)?.id ?? null : null
  })()
  const fallbackAccountId = accounts[0]?.id ?? null

  const [type, setType] = useState<'income' | 'expense'>(slip.suggestedType)
  const [accountId, setAccountId] = useState(() =>
    resolveAccountDefault({ category: undefined, lastByCategory, globalLastAccountId, parsedAccountId, fallbackAccountId }) ?? '',
  )
  const [accountTouched, setAccountTouched] = useState(false)
  const [category, setCategory] = useState('')
  const [datetimeLocal, setDatetimeLocal] = useState(slip.datetime.value ? toDatetimeLocal(slip.datetime.value) : '')
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  const [pendingFd, setPendingFd] = useState<FormData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<BatchDoneAction | null>(null)

  function handleAccountChange(id: string) { setAccountId(id); setAccountTouched(true) }

  function handleCategoryChange(c: string) {
    setCategory(c)
    if (accountTouched) return
    const next = resolveAccountDefault({ category: c, lastByCategory, globalLastAccountId, parsedAccountId, fallbackAccountId })
    if (next) setAccountId(next)
  }

  function buildFd(raw: FormData): FormData {
    const fd = new FormData()
    fd.set('type', type)
    fd.set('account_id', accountId)
    if (category) fd.set('category', category)
    fd.set('amount', raw.get('amount') as string)
    const cp = raw.get('counterparty') as string
    if (cp) fd.set('counterparty', cp)
    const datetimeISO = datetimeLocal ? `${datetimeLocal}:00+07:00` : ''
    fd.set('datetime', datetimeISO)
    if (slip.refCode.value) fd.set('ref_code', slip.refCode.value)
    if (slip.bankCode.value) fd.set('bank_code', slip.bankCode.value)
    return fd
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const raw = new FormData(e.currentTarget)
    setError('')
    setLoading(true)

    const refCode = slip.refCode.value?.trim() ?? ''
    if (!refCode) {
      const amountSatang = parseInputToSatang(raw.get('amount') as string)
      const datetimeISO = datetimeLocal ? `${datetimeLocal}:00+07:00` : ''
      if (amountSatang && accountId && datetimeISO) {
        const { duplicates } = await checkNullRefDedup(accountId, amountSatang, datetimeISO)
        if (duplicates.length > 0) {
          const dup = duplicates[0]
          if (dup.ref_code) { setError(t('hardDuplicate')); setLoading(false); return }
          const when = new Date(dup.datetime).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })
          setDupWarning(t('softDuplicate', { who: dup.counterparty ?? t('unnamed'), when }))
          setPendingFd(buildFd(raw))
          setLoading(false)
          return
        }
      }
    }
    await doCreate(buildFd(raw))
  }

  async function doCreate(fd: FormData) {
    const result = await createTransaction({ error: '' }, fd)
    setLoading(false)
    if (result.error) { setError(result.error) }
    else { setDone('saved'); onDone('saved') }
  }

  async function confirmDup() {
    if (!pendingFd) return
    setDupWarning(null); setLoading(true)
    await doCreate(pendingFd)
  }

  // Collapsed summary after save/skip
  if (done) {
    return (
      <Card className={done === 'saved' ? 'border-income/30 bg-income/5' : 'opacity-50'}>
        <CardContent className="flex items-center gap-3 py-3">
          {done === 'saved'
            ? <CheckCircle2 className="size-4 shrink-0 text-income" />
            : <SkipForward className="size-4 shrink-0 text-muted-foreground" />}
          <p className="flex-1 truncate text-sm font-medium">{filename}</p>
          <Badge variant={done === 'saved' ? 'default' : 'secondary'} className="shrink-0">
            {t(done === 'saved' ? 'batchSaved' : 'batchSkipped')}
          </Badge>
        </CardContent>
      </Card>
    )
  }

  const hasLowConf = [slip.amount, slip.datetime, slip.counterparty].some((f) => f.confidence < LOW_CONF)
  const datetimeISO = datetimeLocal ? `${datetimeLocal}:00+07:00` : ''

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{filename}</p>
          <span className="shrink-0 text-xs text-muted-foreground">{index + 1}/{total}</span>
        </div>
        {hasLowConf && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Info className="mt-0.5 size-3 shrink-0" />
            <span>{t('lowConfidenceNotice')}</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {dupWarning && (
          <div className="mb-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{dupWarning}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDupWarning(null)}>
                {t('cancel')}
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={confirmDup} disabled={loading}>
                {t('saveAnyway')}
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Type */}
          <div className="flex gap-2">
            {(['income', 'expense'] as const).map((ty) => (
              <Button
                key={ty}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setType(ty)}
                className={cn('flex-1', type === ty && (
                  ty === 'income'
                    ? 'border-income/40 bg-income/15 text-income hover:bg-income/25'
                    : 'border-expense/40 bg-expense/15 text-expense hover:bg-expense/25'
                ))}
              >
                {t(ty)}
              </Button>
            ))}
          </div>

          {/* Amount — ฿ prefix + tabular-nums */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xl font-semibold tabular-nums text-muted-foreground">฿</span>
            <div className="relative flex-1">
              <Input
                name="amount"
                type="text"
                inputMode="decimal"
                required
                defaultValue={slip.amount.value ? (slip.amount.value / 100).toFixed(2) : ''}
                placeholder="0.00"
                className={cn(
                  'text-xl font-semibold tabular-nums',
                  slip.amount.confidence < LOW_CONF && 'border-amber-400 pr-8',
                )}
              />
              {slip.amount.confidence < LOW_CONF && (
                <AlertTriangle className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-amber-500" />
              )}
            </div>
          </div>

          {/* Account */}
          <Select value={accountId} onValueChange={handleAccountChange} required>
            <SelectTrigger className="h-9"><SelectValue placeholder={t('account')} /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name} ({a.bank})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Category */}
          <Select value={category} onValueChange={handleCategoryChange}>
            <SelectTrigger className="h-9"><SelectValue placeholder={t('selectCategoryOptional')} /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}><CategoryLabel value={c} /></SelectItem>)}
            </SelectContent>
          </Select>

          {/* Counterparty */}
          <Input
            name="counterparty"
            defaultValue={slip.counterparty.value ?? ''}
            placeholder={type === 'income' ? t('sender') : t('receiver')}
            className={cn(
              'h-9',
              slip.counterparty.confidence < LOW_CONF && slip.counterparty.value && 'border-amber-400',
            )}
          />

          {/* Datetime */}
          <Input
            type="datetime-local"
            required
            value={datetimeLocal}
            onChange={(e) => setDatetimeLocal(e.target.value)}
            className={cn('h-9', slip.datetime.confidence < LOW_CONF && 'border-amber-400')}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={loading}
              onClick={() => { setDone('skipped'); onDone('skipped') }}
            >
              {t('batchSkip')}
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loading || accounts.length === 0 || !datetimeISO}
            >
              {loading ? t('saving') : t('confirmAndSave')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
