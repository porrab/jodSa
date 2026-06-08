'use client'

import { useState, useRef } from 'react'
import { AlertTriangle, ChevronLeft, Info } from 'lucide-react'
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
import type { ParsedSlip } from '@/lib/slip/types'

interface Account {
  id: string
  name: string
  bank: string
}

interface Props {
  slip: ParsedSlip
  accounts: Account[]
  onBack: () => void
  onSuccess: () => void
}

const LOW_CONFIDENCE = 0.7

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= LOW_CONFIDENCE) return null
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <AlertTriangle className="size-2.5" />
      ความมั่นใจต่ำ
    </span>
  )
}

function toDatetimeLocal(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : ''
}

export default function SlipConfirmForm({ slip, accounts, onBack, onSuccess }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [type, setType] = useState<'income' | 'expense'>(slip.suggestedType)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [category, setCategory] = useState('')
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
          const when = new Date(dup.datetime).toLocaleString('th-TH', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })
          setDupWarning(`พบรายการที่คล้ายกัน: ${dup.counterparty ?? 'ไม่ระบุชื่อ'} เมื่อ ${when}`)
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
          <h1 className="text-xl font-semibold">ยืนยันรายการ</h1>
          <p className="text-sm text-muted-foreground">ตรวจสอบและแก้ไขก่อนบันทึก</p>
        </div>
      </div>

      {/* Low-confidence notice */}
      {[slip.amount, slip.datetime, slip.counterparty].some((f) => f.confidence < LOW_CONFIDENCE) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>บางช่องมีความมั่นใจต่ำ — กรุณาตรวจสอบ</span>
        </div>
      )}

      {dupWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{dupWarning}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDupWarning(null)}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={confirmDuplicate} disabled={loading}>
              บันทึกต่อ
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
          <Label>ประเภท</Label>
          <Select value={type} onValueChange={(v) => setType(v as 'income' | 'expense')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="income">รายรับ</SelectItem>
              <SelectItem value="expense">รายจ่าย</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <Label>
            จำนวนเงิน (บาท)
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
          <Label>บัญชี</Label>
          {accounts.length === 0 ? (
            <p className="text-sm text-destructive">ยังไม่มีบัญชี — กรุณาเพิ่มบัญชีก่อน</p>
          ) : (
            <Select value={accountId} onValueChange={setAccountId}>
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
          <Label>หมวดหมู่</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="เลือกหมวดหมู่ (ไม่บังคับ)" />
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
            {type === 'income' ? 'ผู้โอน' : 'ผู้รับ'}
            <ConfidenceBadge confidence={slip.counterparty.confidence} />
          </Label>
          <Input
            name="counterparty"
            defaultValue={slip.counterparty.value ?? ''}
            placeholder="ชื่อผู้โอน/ผู้รับ"
            className={slip.counterparty.confidence < LOW_CONFIDENCE && slip.counterparty.value ? 'border-amber-400' : ''}
          />
        </div>

        {/* Datetime */}
        <div className="space-y-1.5">
          <Label>
            วัน/เวลา
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
            <Label className="text-muted-foreground">Ref (จาก QR)</Label>
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
          {loading ? 'กำลังบันทึก...' : 'ยืนยันและบันทึก'}
        </Button>
      </form>
    </div>
  )
}
