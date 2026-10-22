'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import InvestClient, { type Holding, type Asset } from './invest-client'
import PortfolioDashboard, { type DashboardData, type SnapshotRow } from './portfolio-dashboard'
import PlanClient, { type PlanRow } from './plan-client'

/**
 * M3/M5 — same tabbed pattern as app/(app)/budgets/budgets-overview-tabs.tsx:
 * "ถือครอง" (Holdings, the M1 CRUD list) stays the default first tab; "ภาพรวม"
 * (Overview, the M3 dashboard) and "แผนรายเดือน" (Plan, the M5 planner) are
 * later segments so a first visit to /invest never pays for the lazy Recharts
 * chunk or mounts the planner form until opened.
 */
export default function InvestTabs({
  holdings,
  assets,
  dashboard,
  snapshots,
  plans,
  initialHoldingId,
}: {
  holdings: Holding[]
  assets: Asset[]
  dashboard: DashboardData
  snapshots: SnapshotRow[]
  plans: PlanRow[]
  initialHoldingId: string | null
}) {
  const t = useTranslations('invest')
  const [tab, setTab] = useState<'holdings' | 'overview' | 'plan'>('holdings')

  return (
    <div className="space-y-4">
      <div className="flex border-b border-border">
        {(['holdings', 'overview', 'plan'] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              'min-h-11 border-b-[3px] px-4 py-2 text-sm transition-colors',
              tab === tb ? 'border-honey-edge font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tb === 'holdings' ? t('tabHoldings') : tb === 'overview' ? t('tabOverview') : t('tabPlan')}
          </button>
        ))}
      </div>

      {tab === 'holdings' ? (
        <InvestClient holdings={holdings} assets={assets} initialHoldingId={initialHoldingId} />
      ) : tab === 'overview' ? (
        <PortfolioDashboard dashboard={dashboard} snapshots={snapshots} />
      ) : (
        <PlanClient plans={plans} />
      )}
    </div>
  )
}
