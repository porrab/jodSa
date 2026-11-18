'use client'

import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'

/** Both portfolio views explain the same server-computed valuation policy. */
export function PortfolioValuationNotes({ unpricedCount, excludedCount }: {
  unpricedCount: number
  excludedCount: number
}) {
  const t = useTranslations('invest')
  return <>
    {unpricedCount > 0 && <p className="text-sm text-muted-foreground">{t('unpricedNote', { count: unpricedCount })}</p>}
    {excludedCount > 0 && <p className="flex items-center gap-1 text-sm text-destructive"><AlertTriangle className="size-3.5 shrink-0" />{t('excludedFxNote', { count: excludedCount })}</p>}
  </>
}
