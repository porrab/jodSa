'use client'

import { useActionState, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, PiggyBank } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import BudgetBar from '@/components/budget-bar'
import { createBudget, updateBudget, deleteBudget } from '@/app/actions/budgets'
import { CATEGORIES } from '@/lib/validators/transaction'
import type { BudgetRow, BudgetStatus } from '@/lib/budget'

export type BudgetItem = { budget: BudgetRow; status: BudgetStatus }

function BudgetForm({
  defaultValues,
  action,
  onSuccess,
}: {
  defaultValues?: BudgetRow
  action: typeof createBudget | typeof updateBudget
  onSuccess: () => void
}) {
  const [period, setPeriod] = useState<'day' | 'month'>(defaultValues?.period ?? 'month')
  const [scope, setScope] = useState<'overall' | 'category'>(defaultValues?.scope ?? 'overall')
  const [category, setCategory] = useState(defaultValues?.category ?? '')

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      fd.set('period', period)
      fd.set('scope', scope)
      if (scope === 'category' && category) fd.set('category', category)
      const result = await action(prev, fd)
      if (!result.error) onSuccess()
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-4">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>รอบ</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as 'day' | 'month')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">รายเดือน</SelectItem>
              <SelectItem value="day">รายวัน</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>ขอบเขต</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as 'overall' | 'category')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="overall">ทั้งหมด</SelectItem>
              <SelectItem value="category">เฉพาะหมวด</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {scope === 'category' && (
        <div className="space-y-1.5">
          <Label>หมวดหมู่</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="เลือกหมวดหมู่" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="amount">งบประมาณ (บาท)</Label>
        <Input
          id="amount" name="amount" type="text" inputMode="decimal" required
          defaultValue={defaultValues ? (defaultValues.amount_satang / 100).toFixed(2) : ''}
          placeholder="0.00"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    </form>
  )
}

export default function BudgetsClient({ items }: { items: BudgetItem[] }) {
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('ลบงบประมาณนี้?')) return
    try {
      await deleteBudget(id)
      toast.success('ลบงบประมาณแล้ว')
    } catch {
      toast.error('ไม่สามารถลบได้')
    }
  }

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button><Plus className="size-4 mr-2" />เพิ่มงบประมาณ</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>เพิ่มงบประมาณ</DialogTitle></DialogHeader>
          <BudgetForm action={createBudget} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <PiggyBank className="mx-auto mb-2 size-6" />
          <p>ยังไม่มีงบประมาณ</p>
          <p className="text-sm mt-1">ตั้งงบรายเดือนหรือรายวัน แล้วดูยอดคงเหลือเทียบกับการใช้จริง</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(({ budget, status }) => (
            <Card key={budget.id}>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex-1">
                  <BudgetBar budget={budget} status={status} />
                </div>
                <div className="flex flex-col gap-1">
                  <Dialog open={editId === budget.id} onOpenChange={(o) => setEditId(o ? budget.id : null)}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>แก้ไขงบประมาณ</DialogTitle></DialogHeader>
                      <BudgetForm
                        defaultValues={budget}
                        action={updateBudget}
                        onSuccess={() => setEditId(null)}
                      />
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(budget.id)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
