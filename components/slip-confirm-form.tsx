'use client'

import { useState, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, ChevronLeft, Info, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createTransaction, checkNullRefDedup } from '@/app/actions/transactions'
import { parseInputToSatang } from '@/lib/money'
import { CATEGORIES } from '@/lib/validators/transaction'
import { resolveAccountDefault, type LastAccountMap } from '@/lib/last-account'
import type { ParsedSlip } from '@/lib/slip/types'

interface Account {
  id: string
  name: string
  bank: string
}

interface Props {
  slip: ParsedSlip
  accounts: Account[]
  lastByCategory?: LastAccountMap
  globalLastAccountId?: string | null
  onBack: () => void
  onSuccess: () => void
}

const LOW_CONFIDENCE = 0.7

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const t = useTranslations('slip')
  if (confidence >= LOW_CONFIDENCE) return null
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <AlertTriangle className="size-2.5" />
      {t('lowConfidence')}
    </span>
  )
}

function toDatetimeLocal(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : ''
}

export default function SlipConfirmForm({
  slip,
  accounts,
  lastByCategory = {},
  globalLastAccountId = null,
  onBack,
  onSuccess,
}: Props) {
  const t = useTranslations('slip')
  const locale = useLocale()
  const formRef = useRef<HTMLFormElement>(null)
  const [type, setType] = useState<'income' | 'expense'>(slip.suggestedType)
  // Account whose bank matches the slip's detected bank (case-insensitive: account.bank is
  // e.g. "KBank" while inferBankCode emits "KBANK"). Per precedence in prompt.md §6, this
  // parsed account wins over the per-category default; if it's null, the per-category /
  // global last-used fallback chain kicks in.
  const parsedAccountId = (() => {
    const code = slip.bankCode.value?.toLowerCase()
    return code ? accounts.find((a) => a.bank.toLowerCase() === code)?.id ?? null : null
  })()
  const fallbackAccountId = accounts[0]?.id ?? null
  const [accountId, setAccountId] = useState(() =>
    resolveAccountDefault({
      category: undefined,
      lastByCategory,
      globalLastAccountId,
      parsedAccountId,
      fallbackAccountId,
    }) ?? '',
  )
  // Precedence rule #1 — once the user picks an account themselves, no later category
  // change is allowed to overwrite their choice.
  const [accountTouched, setAccountTouched] = useState(false)
  const [category, setCategory] = useState('')

  function handleAccountChange(id: string) {
    setAccountId(id)
    setAccountTouched(true)
  }

  function handleCategoryChange(c: string) {
    setCategory(c)
    if (accountTouched) return
    const next = resolveAccountDefault({
      category: c,
      lastByCategory,
      globalLastAccountId,
      parsedAccountId,
      fallbackAccountId,
    })
    if (next) setAccountId(next)
  }
  const [datetimeLocal, setDatetimeLocal] = useState(
    slip.datetime.value ? toDatetimeLocal(slip.datetime.value) : '',
  )
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(formData: FormData) {
    // Radix UI Select values aren't in native FormData — add them manually
    formData.set('type', type)
    formData.set('account_id', accountId)
    if (category) formData.set('category', category)

    setError('')
    setLoading(true)

    const refCode = (formData.get('ref_code') as string | null)?.trim() ?? ''

    // Soft dedup: check for near-duplicate if ref_code is absent
    if (!refCode) {
      const amountSatang = parseInputToSatang((formData.get('amount') as string) ?? '')
      const acctId = formData.get('account_id') as string
      const dt = formData.get('datetime') as string
      if (amountSatang && acctId && dt) {
        const { duplicates } = await checkNullRefDedup(acctId, amountSatang, dt)
        if (duplicates.length > 0) {
          const dup = duplicates[0]
          // If the existing row has a ref_code, QR decode was reliable on first import —
          // treat this as a hard duplicate even though this attempt's QR decode failed (M2-7).
          if (dup.ref_code) {
            setError(t('hardDuplicate'))
            setLoading(false)
            return
          }
          const when = new Date(dup.datetime).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })
          setDupWarning(t('softDuplicate', { who: dup.counterparty ?? t('unnamed'), when }))
          setPendingFormData(formData)
          setLoading(false)
          return
        }
      }
    }

    await doCreate(formData)
  }

  async function doCreate(formData: FormData) {
    const result = await createTransaction({ error: '' }, formData)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      onSuccess()
    }
  }

  async function confirmDuplicate() {
    if (!pendingFormData) return
    setDupWarning(null)
    setLoading(true)
    await doCreate(pendingFormData)
  }

  const datetimeISO = datetimeLocal ? `${datetimeLocal}:00+07:00` : ''

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t('confirmTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('confirmSubtitle')}</p>
        </div>
      </div>

      {/* Privacy promise — visible at the scan/confirm step */}
      <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2 text-sm text-primary">
        <LockKeyhole className="size-4 shrink-0" />
        <span>{t('privacyBadge')}</span>
      </div>

      {/* Low-confidence notice */}
      {[slip.amount, slip.datetime, slip.counterparty].some((f) => f.confidence < LOW_CONFIDENCE) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>{t('lowConfidenceNotice')}</span>
        </div>
      )}

      {dupWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{dupWarning}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDupWarning(null)}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={confirmDuplicate} disabled={loading}>
              {t('saveAnyway')}
            </Button>
          </div>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)) }}
        className="space-y-4"
      >
        {/* hidden fields */}
        <input type="hidden" name="datetime" value={datetimeISO} />
        {slip.refCode.value && (
          <input type="hidden" name="ref_code" value={slip.refCode.value} />
        )}
        {slip.bankCode.value && (
          <input type="hidden" name="bank_code" value={slip.bankCode.value} />
        )}

        {/* Type */}
        <div className="space-y-1.5">
          <Label>{t('type')}</Label>
          <Select value={type} onValueChange={(v) => setType(v as 'income' | 'expense')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="income">{t('income')}</SelectItem>
              <SelectItem value="expense">{t('expense')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <Label>
            {t('amountLabel')}
            <ConfidenceBadge confidence={slip.amount.confidence} />
          </Label>
          <Input
            name="amount"
            type="text"
            inputMode="decimal"
            required
            defaultValue={slip.amount.value ? (slip.amount.value / 100).toFixed(2) : ''}
            placeholder="0.00"
            className={slip.amount.confidence < LOW_CONFIDENCE ? 'border-amber-400' : ''}
          />
        </div>

        {/* Account */}
        <div className="space-y-1.5">
          <Label>{t('account')}</Label>
          {accounts.length === 0 ? (
            <p className="text-sm text-destructive">{t('noAccounts')}</p>
          ) : (
            <Select value={accountId} onValueChange={handleAccountChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.bank})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label>{t('category')}</Label>
          <Select value={category} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectCategoryOptional')} />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Counterparty */}
        <div className="space-y-1.5">
          <Label>
            {type === 'income' ? t('sender') : t('receiver')}
            <ConfidenceBadge confidence={slip.counterparty.confidence} />
          </Label>
          <Input
            name="counterparty"
            defaultValue={slip.counterparty.value ?? ''}
            placeholder={t('counterpartyPlaceholder')}
            className={slip.counterparty.confidence < LOW_CONFIDENCE && slip.counterparty.value ? 'border-amber-400' : ''}
          />
        </div>

        {/* Datetime */}
        <div className="space-y-1.5">
          <Label>
            {t('datetime')}
            <ConfidenceBadge confidence={slip.datetime.confidence} />
          </Label>
          <Input
            type="datetime-local"
            required
            value={datetimeLocal}
            onChange={(e) => setDatetimeLocal(e.target.value)}
            className={slip.datetime.confidence < LOW_CONFIDENCE ? 'border-amber-400' : ''}
          />
        </div>

        {/* Ref code (read-only display) */}
        {slip.refCode.value && (
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">{t('refFromQr')}</Label>
            <Input value={slip.refCode.value} readOnly className="font-mono text-xs text-muted-foreground" />
          </div>
        )}

        {/* Debug block (dev-only) */}
        {slip.rawTextDebug && (
          <details className="rounded-lg border p-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground">OCR debug</summary>
            <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">{slip.rawTextDebug}</pre>
          </details>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          className="w-full"
          disabled={loading || accounts.length === 0 || !datetimeISO}
        >
          {loading ? t('saving') : t('confirmAndSave')}
        </Button>
      </form>
    </div>
  )
}
