'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { openQuickAdd, type TxType } from '@/lib/quick-add'

const TYPE_META: Record<TxType, { icon: typeof ArrowDownLeft; cls: string }> = {
  income: { icon: ArrowDownLeft, cls: 'text-income' },
  expense: { icon: ArrowUpRight, cls: 'text-expense' },
  transfer: { icon: ArrowLeftRight, cls: 'text-transfer' },
}

/**
 * Home quick-add — the inline amount + type + scan/save block (design 07 rev 2026-06-15).
 * Tapping "บันทึก" hands the amount+type to the global quick-add sheet to finish the rest;
 * the slip-scan button keeps the existing /import flow (single-slip).
 */
export default function QuickAddCard() {
  const t = useTranslations('quickAdd')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<TxType>('expense')
  const slipInputRef = useRef<HTMLInputElement>(null)

  function onSave() {
    openQuickAdd({ amount: amount || undefined, type })
    setAmount('')
  }

  function onSlipFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) openQuickAdd({ mode: 'slip', files })
  }

  return (
    <div className="space-y-3">
        {/* Affordance must match the sheet's amount field (design v4 F2): the same
            value was entered through two inputs with two different affordances —
            bordered in the sheet, nothing at all here. Naked `bg-transparent
            border-0` also left the base `dark:bg-input/30` as the only thing
            drawing a box, so this field appeared in dark and vanished in light.
            Same wrapper as `transaction-form.tsx`; only the type scale differs
            (this is Home's focal input). */}
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 focus-within:ring-2 focus-within:ring-honey-edge">
          <span className="select-none text-3xl font-semibold tabular-nums text-muted-foreground">฿</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            // Spec: "Do not auto-focus the amount / auto-raise the keyboard on open" —
            // the user might be checking a balance, not logging.
            autoFocus={false}
            // `md:text-4xl` is not redundant: the shadcn Input base carries
            // `md:text-sm`, and a media-query rule outranks the unprefixed
            // `text-4xl` at >= md — so without this the amount rendered at 14px
            // on desktop next to a 30px ฿. Same class-collision family as the
            // `dark:bg-input/30` bug this field was fixed for (design v4 F2).
            className="h-14 border-0 bg-transparent px-0 text-4xl font-semibold tabular-nums shadow-none focus-visible:ring-0 md:text-4xl dark:bg-transparent"
            aria-label={t('amountLabel')}
          />
        </div>

        <Segmented className="grid-cols-3" aria-label={t('type')}>
          {(['income', 'expense', 'transfer'] as const).map((ty) => {
            const Icon = TYPE_META[ty].icon
            return (
            <SegmentedItem
              key={ty}
              onClick={() => setType(ty)}
              active={type === ty}
              className={cn('press inline-flex items-center justify-center gap-1.5', TYPE_META[ty].cls)}
            >
              <Icon aria-hidden="true" className="size-4" />
              {t(ty)}
            </SegmentedItem>
          )})}
        </Segmented>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="press flex-1" onClick={() => slipInputRef.current?.click()}>
            <Camera className="mr-2 size-4" />
            {t('scan')}
          </Button>
          <input ref={slipInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onSlipFiles} />
          <Button type="button" onClick={onSave} className="press flex-1">
            {t('save')}
          </Button>
        </div>
    </div>
  )
}
