'use client'

import { useActionState, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  createRecurringRule, updateRecurringRule, deleteRecurringRule,
} from '@/app/actions/recurring'
import { FREQ_LABELS, WEEKDAYS } from '@/lib/validators/recurring'
import { CATEGORIES } from '@/lib/validators/transaction'
import { formatTHB } from '@/lib/money'

type Account = { id: string; name: string; bank: string }

export type Rule = {
  id: string
  type: 'income' | 'expense'
  amount_satang: number
  category: string | null
  account_id: string
  freq: 'weekly' | 'monthly' | 'yearly'
  interval: number
  by_weekday: number[] | null
  start_date: string
  end_date: string | null
}

function RuleForm({
  accounts,
  defaultValues,
  action,
  onSuccess,
}: {
  accounts: Account[]
  defaultValues?: Rule
  action: typeof createRecurringRule | typeof updateRecurringRule
  onSuccess: () => void
}) {
  const [type, setType] = useState<'income' | 'expense'>(defaultValues?.type ?? 'expense')
  const [accountId, setAccountId] = useState(defaultValues?.account_id ?? accounts[0]?.id ?? '')
  const [category, setCategory] = useState(defaultValues?.category ?? '')
  const [freq, setFreq] = useState<'weekly' | 'monthly' | 'yearly'>(defaultValues?.freq ?? 'monthly')
  const [weekdays, setWeekdays] = useState<number[]>(defaultValues?.by_weekday ?? [])

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('type', type)
      fd.set('account_id', accountId)
      if (category) fd.set('category', category)
      fd.set('freq', freq)
      fd.delete('by_weekday')
      if (freq === 'weekly') for (const d of weekdays) fd.append('by_weekday', String(d))
      const result = await action(prev, fd)
      if (!result.error) onSuccess()
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  function toggleWeekday(d: number) {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  }

  return (
    <form action={formAction} className="space-y-4">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      <div className="space-y-1.5">
        <Label>ประเภท</Label>
        <Select value={type} onValueChange={(v) => setType(v as 'income' | 'expense')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">รายจ่าย</SelectItem>
            <SelectItem value="income">รายรับ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="amount">จำนวนเงิน (บาท)</Label>
        <Input
          id="amount" name="amount" type="text" inputMode="decimal" required
          defaultValue={defaultValues ? (defaultValues.amount_satang / 100).toFixed(2) : ''}
          placeholder="0.00"
        />
      </div>

      <div className="space-y-1.5">
        <Label>บัญชี</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger><SelectValue placeholder="เลือกบัญชี" /></SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name} ({a.bank})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>หมวดหมู่ (ไม่บังคับ)</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue placeholder="เลือกหมวดหมู่" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>ความถี่</Label>
          <Select value={freq} onValueChange={(v) => setFreq(v as typeof freq)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">{FREQ_LABELS.weekly}</SelectItem>
              <SelectItem value="monthly">{FREQ_LABELS.monthly}</SelectItem>
              <SelectItem value="yearly">{FREQ_LABELS.yearly}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="interval">ทุก ๆ</Label>
          <Input
            id="interval" name="interval" type="number" min={1} max={99} required
            defaultValue={defaultValues?.interval ?? 1}
          />
        </div>
      </div>

      {freq === 'weekly' && (
        <div className="space-y-1.5">
          <Label>วันในสัปดาห์</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => toggleWeekday(w.value)}
                className={`size-9 rounded-md border text-sm transition-colors ${
                  weekdays.includes(w.value)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">เว้นว่างไว้ = ใช้วันเดียวกับวันเริ่ม</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start_date">วันเริ่ม</Label>
          <Input
            id="start_date" name="start_date" type="date" required
            defaultValue={defaultValues?.start_date ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_date">วันสิ้นสุด (ไม่บังคับ)</Label>
          <Input
            id="end_date" name="end_date" type="date"
            defaultValue={defaultValues?.end_date ?? ''}
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending || accounts.length === 0}>
        {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    </form>
  )
}

function freqSummary(rule: Rule): string {
  const every = rule.interval > 1 ? `ทุก ${rule.interval} ` : ''
  const unit = { weekly: 'สัปดาห์', monthly: 'เดือน', yearly: 'ปี' }[rule.freq]
  if (rule.freq === 'weekly' && rule.by_weekday?.length) {
    const days = rule.by_weekday
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
      .join(' ')
    return `${every || 'ทุก'}${unit} · ${days}`
  }
  return `${every || 'ทุก'}${unit}`
}

export default function RecurringClient({
  rules,
  accounts,
}: {
  rules: Rule[]
  accounts: Account[]
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('ลบกฎนี้? รายการที่สร้างจากกฎนี้จะถูกลบด้วย')) return
    try {
      await deleteRecurringRule(id)
      toast.success('ลบกฎแล้ว')
    } catch {
      toast.error('ไม่สามารถลบได้')
    }
  }

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button disabled={accounts.length === 0}>
            <Plus className="size-4 mr-2" />เพิ่มรายการประจำ
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>เพิ่มรายการประจำ</DialogTitle></DialogHeader>
          <RuleForm accounts={accounts} action={createRecurringRule} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">เพิ่มบัญชีก่อนจึงจะสร้างรายการประจำได้</p>
      )}

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Repeat className="mx-auto mb-2 size-6" />
          <p>ยังไม่มีรายการประจำ</p>
          <p className="text-sm mt-1">เช่น ค่าเช่า เงินเดือน ค่าสมาชิกรายเดือน</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rules.map((rule) => {
            const acct = accounts.find((a) => a.id === rule.account_id)
            return (
              <Card key={rule.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className={`tabular-nums ${rule.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {rule.type === 'income' ? '+' : '-'}{formatTHB(rule.amount_satang)}
                    </span>
                    <div className="flex gap-1">
                      <Dialog open={editId === rule.id} onOpenChange={(o) => setEditId(o ? rule.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] overflow-y-auto">
                          <DialogHeader><DialogTitle>แก้ไขรายการประจำ</DialogTitle></DialogHeader>
                          <RuleForm
                            accounts={accounts}
                            defaultValues={rule}
                            action={updateRecurringRule}
                            onSuccess={() => setEditId(null)}
                          />
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                  <p>{freqSummary(rule)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {acct && <Badge variant="secondary">{acct.name}</Badge>}
                    {rule.category && <Badge variant="outline">{rule.category}</Badge>}
                  </div>
                  <p className="text-xs">
                    เริ่ม {rule.start_date}{rule.end_date ? ` · ถึง ${rule.end_date}` : ''}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
