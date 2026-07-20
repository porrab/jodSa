'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { openQuickAdd, type TxType } from '@/lib/quick-add'

const TYPE_ACTIVE_CLS: Record<TxType, string> = {
  income:   'border-income/40 bg-income/15 text-income hover:bg-income/25',
  expense:  'border-expense/40 bg-expense/15 text-expense hover:bg-expense/25',
  transfer: 'border-transfer/40 bg-transfer/15 text-transfer hover:bg-transfer/25',
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

  function onSave() {
    openQuickAdd({ amount: amount || undefined, type })
    setAmount('')
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {/* Affordance must match the sheet's amount field (design v4 F2): the same
            value was entered through two inputs with two different affordances —
            bordered in the sheet, nothing at all here. Naked `bg-transparent
            border-0` also left the base `dark:bg-input/30` as the only thing
            drawing a box, so this field appeared in dark and vanished in light.
            Same wrapper as `transaction-form.tsx`; only the type scale differs
            (this is Home's focal input). */}
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
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

        <div className="flex gap-2">
          {(['income', 'expense', 'transfer'] as const).map((ty) => (
            <Button
              key={ty}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setType(ty)}
              className={cn('press flex-1', type === ty && TYPE_ACTIVE_CLS[ty])}
            >
              {t(ty)}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <Button asChild variant="outline" className="press flex-1">
            <Link href="/import">
              <Camera className="mr-2 size-4" />
              {t('scan')}
            </Link>
          </Button>
          <Button type="button" onClick={onSave} className="press flex-1">
            {t('save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
