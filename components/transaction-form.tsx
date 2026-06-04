'use client'

import { useActionState, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createTransaction } from '@/app/actions/transactions'
import { CATEGORIES } from '@/lib/validators/transaction'
import { formatTHBCompact } from '@/lib/money'
import type { Database } from '@/lib/supabase/types'

type Account = Database['public']['Tables']['accounts']['Row']
type TxType = 'income' | 'expense' | 'transfer'

const TYPE_LABELS: Record<TxType, string> = {
  income: 'รายรับ',
  expense: 'รายจ่าย',
  transfer: 'โอนเงิน',
}

export default function TransactionForm({
  accounts,
  onSuccess,
  defaultValues,
}: {
  accounts: Account[]
  onSuccess?: () => void
  defaultValues?: Partial<{
    type: TxType
    amount: string
    account_id: string
    to_account_id: string
    category: string
    counterparty: string
    datetime: string
    ref_code: string
    bank_code: string
  }>
}) {
  const [type, setType] = useState<TxType>(defaultValues?.type ?? 'expense')
  const [accountId, setAccountId] = useState(defaultValues?.account_id ?? '')
  const [toAccountId, setToAccountId] = useState(defaultValues?.to_account_id ?? '')
  const [category, setCategory] = useState(defaultValues?.category ?? '')

  const now = new Date()
  const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('type', type)
      fd.set('account_id', accountId)
      if (type === 'transfer') fd.set('to_account_id', toAccountId)
      if (category) fd.set('category', category)
      // Convert local datetime to offset-aware ISO
      const dtLocal = fd.get('datetime') as string
      if (dtLocal) {
        const dt = new Date(dtLocal)
        fd.set('datetime', dt.toISOString())
      }
      const result = await createTransaction(prev, fd)
      if (!result.error) {
        toast.success('บันทึกรายการแล้ว')
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-4">
      {/* Type */}
      <div className="space-y-1">
        <Label>ประเภท</Label>
        <div className="flex gap-2">
          {(['income', 'expense', 'transfer'] as const).map((t) => (
            <Button
              key={t}
              type="button"
              variant={type === t ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType(t)}
              className="flex-1"
            >
              {TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="space-y-1">
        <Label htmlFor="amount">จำนวนเงิน (บาท)</Label>
        <Input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={defaultValues?.amount}
          required
        />
      </div>

      {/* Account */}
      <div className="space-y-1">
        <Label>{type === 'transfer' ? 'บัญชีต้นทาง' : 'บัญชี'}</Label>
        <Select value={accountId} onValueChange={setAccountId} required>
          <SelectTrigger>
            <SelectValue placeholder="เลือกบัญชี" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} — {a.bank}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* To account (transfer only) */}
      {type === 'transfer' && (
        <div className="space-y-1">
          <Label>บัญชีปลายทาง</Label>
          <Select value={toAccountId} onValueChange={setToAccountId} required>
            <SelectTrigger>
              <SelectValue placeholder="เลือกบัญชีปลายทาง" />
            </SelectTrigger>
            <SelectContent>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} — {a.bank}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Category (non-transfer) */}
      {type !== 'transfer' && (
        <div className="space-y-1">
          <Label>หมวดหมู่ (ไม่บังคับ)</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="เลือกหมวดหมู่" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Counterparty (non-transfer) */}
      {type !== 'transfer' && (
        <div className="space-y-1">
          <Label htmlFor="counterparty">ผู้รับ / ผู้โอน (ไม่บังคับ)</Label>
          <Input
            id="counterparty"
            name="counterparty"
            placeholder="ชื่อร้านค้า / บุคคล"
            defaultValue={defaultValues?.counterparty}
          />
        </div>
      )}

      {/* Datetime */}
      <div className="space-y-1">
        <Label htmlFor="datetime">วันที่และเวลา</Label>
        <Input
          id="datetime"
          name="datetime"
          type="datetime-local"
          defaultValue={defaultValues?.datetime ?? localISO}
          required
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
      </Button>
    </form>
  )
}
