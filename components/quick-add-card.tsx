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
        <div className="flex items-center gap-2">
          <span className="text-3xl font-semibold tabular-nums text-muted-foreground">฿</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            // Spec: "Do not auto-focus the amount / auto-raise the keyboard on open" —
            // the user might be checking a balance, not logging.
            autoFocus={false}
            className="h-12 border-0 bg-transparent px-0 text-4xl font-semibold tabular-nums shadow-none focus-visible:ring-0"
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
