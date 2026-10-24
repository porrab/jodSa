'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CategoryLabel } from '@/lib/categories'
import { toast } from 'sonner'
import { Plus, PiggyBank, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Chip } from '@/components/ui/chip'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
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
  const t = useTranslations('budget')
  const tc = useTranslations('common')
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

        <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t('period')}</Label>
          <div className="flex flex-wrap gap-2">
            <Chip pressed={period === 'month'} onClick={() => setPeriod('month')}>{t('periodMonth')}</Chip>
            <Chip pressed={period === 'day'} onClick={() => setPeriod('day')}>{t('periodDay')}</Chip>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t('scope')}</Label>
          <div className="flex flex-wrap gap-2">
            <Chip pressed={scope === 'overall'} onClick={() => setScope('overall')}>{t('scopeOverall')}</Chip>
            <Chip pressed={scope === 'category'} onClick={() => setScope('category')}>{t('scopeCategory')}</Chip>
          </div>
        </div>
      </div>

      {scope === 'category' && (
        <div className="space-y-1.5">
          <Label>{t('category')} <RequiredMark /></Label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip key={c} pressed={category === c} onClick={() => setCategory(c)}><CategoryLabel value={c} /></Chip>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="amount">{t('amountLabel')} <RequiredMark /></Label>
        <Input
          id="amount" name="amount" type="text" inputMode="decimal" required
          defaultValue={defaultValues ? (defaultValues.amount_satang / 100).toFixed(2) : ''}
          placeholder="0.00"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  )
}

export default function BudgetsClient({ items }: { items: BudgetItem[] }) {
  const t = useTranslations('budget')
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  useEffect(() => {
    const open = () => setAddOpen(true)
    window.addEventListener('jodsa:budget-add', open)
    return () => window.removeEventListener('jodsa:budget-add', open)
  }, [])

  async function handleDelete(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    try {
      await deleteBudget(id)
      toast.success(t('deleted'))
    } catch {
      toast.error(t('deleteFailed'))
    }
  }

  return (
    <div className="space-y-4">
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-lg overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('add')}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6"><BudgetForm action={createBudget} onSuccess={() => setAddOpen(false)} /></div>
        </SheetContent>
      </Sheet>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <PiggyBank className="mx-auto mb-2 size-6" />
          <p>{t('empty')}</p>
          <p className="text-sm mt-1">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {items.map(({ budget, status }) => (
            <div key={budget.id}>
              <button type="button" onClick={() => setEditId(budget.id)} className="flex w-full items-center gap-3 text-left hover:bg-accent/40">
                <div className="min-w-0 flex-1">
                  <BudgetBar budget={budget} status={status} />
                </div>
                <ChevronRight className="mr-2 size-4 shrink-0 text-muted-foreground" />
              </button>
              <Sheet open={editId === budget.id} onOpenChange={(o) => setEditId(o ? budget.id : null)}>
                <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-lg overflow-y-auto rounded-t-2xl">
                  <SheetHeader><SheetTitle>{t('edit')}</SheetTitle></SheetHeader>
                  <div className="space-y-6 px-4 pb-6">
                    <BudgetForm defaultValues={budget} action={updateBudget} onSuccess={() => setEditId(null)} />
                    <button type="button" onClick={() => handleDelete(budget.id)} className="text-sm text-destructive hover:underline">
                      {t('deleteAction')}
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
