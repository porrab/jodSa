'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import TransactionForm from '@/components/transaction-form'
import type { LastAccountMap } from '@/lib/last-account'
import type { Database } from '@/lib/supabase/types'

type Account = Pick<Database['public']['Tables']['accounts']['Row'], 'id' | 'name' | 'bank'>

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00+07:00`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

export default function BackfillGapSheet({
  open,
  presetDate,
  accounts,
  lastByCategory,
  globalLastAccountId,
  onOpenChange,
}: {
  open: boolean
  presetDate: string
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('reconcile')
  const [date, setDate] = useState(presetDate)
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => {
    if (open) {
      setDate(presetDate)
      setSavedCount(0)
    }
  }, [open, presetDate])

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="mx-auto max-h-[92svh] max-w-lg overflow-y-auto rounded-t-2xl">
      <SheetHeader><SheetTitle>{t('gapBackfillTitle')}</SheetTitle></SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        <p className="text-sm text-muted-foreground">{t('gapBackfillHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Chip pressed={false} onClick={() => setDate(shiftDay(date, -1))}>{t('previousDay')}</Chip>
          <input aria-label={t('chooseDate')} type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-11 rounded-full border border-border bg-card px-3 text-sm" />
          <Chip pressed={false} onClick={() => setDate(shiftDay(date, 1))}>{t('nextDay')}</Chip>
        </div>
        {/* TODO(C2/0012): add invest/divest only after migration 0012 is live. */}
        <TransactionForm
          key={`${date}-${savedCount}`}
          accounts={accounts}
          lastByCategory={lastByCategory}
          globalLastAccountId={globalLastAccountId}
          defaultValues={{ datetime: `${date}T12:00` }}
          onSuccess={() => setSavedCount((count) => count + 1)}
          submitLabel={t('saveAndContinue')}
          idPrefix="gap-backfill"
        />
        {savedCount > 0 && <p className="text-sm text-muted-foreground">{t('savedCount', { count: savedCount })}</p>}
        <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>{t('done')}</Button>
      </div>
    </SheetContent>
  </Sheet>
}
