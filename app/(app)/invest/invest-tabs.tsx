'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import InvestClient, { type Holding, type Asset } from './invest-client'
import PortfolioDashboard, { type DashboardData, type SnapshotRow } from './portfolio-dashboard'

/**
 * M3 — same tabbed pattern as app/(app)/budgets/budgets-overview-tabs.tsx:
 * "ถือครอง" (Holdings, the M1 CRUD list) stays the default first tab; "ภาพรวม"
 * (Overview, the new M3 dashboard) is a second segment so a first visit to
 * /invest never pays for the lazy Recharts chunk (mounted only when opened).
 */
export default function InvestTabs({
  holdings,
  assets,
  dashboard,
  snapshots,
}: {
  holdings: Holding[]
  assets: Asset[]
  dashboard: DashboardData
  snapshots: SnapshotRow[]
}) {
  const t = useTranslations('invest')
  const [tab, setTab] = useState<'holdings' | 'overview'>('holdings')

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border p-0.5">
        {(['holdings', 'overview'] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === tb ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tb === 'holdings' ? t('tabHoldings') : t('tabOverview')}
          </button>
        ))}
      </div>

      {tab === 'holdings' ? (
        <InvestClient holdings={holdings} assets={assets} />
      ) : (
        <PortfolioDashboard dashboard={dashboard} snapshots={snapshots} />
      )}
    </div>
  )
}
