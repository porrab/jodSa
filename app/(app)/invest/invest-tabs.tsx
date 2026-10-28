'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PageTabs, PageTab } from '@/components/ui/page-tabs'
import InvestClient, { type Holding, type Asset } from './invest-client'
import PortfolioDashboard, { type DashboardData, type SnapshotRow } from './portfolio-dashboard'
import PlanClient, { type PlanRow } from './plan-client'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

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
  accounts,
  dashboard,
  snapshots,
  plans,
  initialHoldingId,
}: {
  holdings: Holding[]
  assets: Asset[]
  accounts: Array<{ id: string; name: string; bank: string }>
  dashboard: DashboardData
  snapshots: SnapshotRow[]
  plans: PlanRow[]
  initialHoldingId: string | null
}) {
  const t = useTranslations('invest')
  const [tab, setTab] = useState<'holdings' | 'overview' | 'plan'>('holdings')

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        action={<Button size="sm" onClick={() => window.dispatchEvent(new Event('jodsa:holding-add'))}><Plus className="size-4" />{t('addHolding')}</Button>}
      />
      <PageTabs className="grid-cols-3">
        {(['holdings', 'overview', 'plan'] as const).map((tb) => (
          <PageTab
            key={tb}
            onClick={() => setTab(tb)}
            active={tab === tb}
          >
            {tb === 'holdings' ? t('tabHoldings') : tb === 'overview' ? t('tabOverview') : t('tabPlan')}
          </PageTab>
        ))}
      </PageTabs>

      {tab === 'holdings' ? (
        <InvestClient holdings={holdings} assets={assets} accounts={accounts} initialHoldingId={initialHoldingId} />
      ) : tab === 'overview' ? (
        <PortfolioDashboard dashboard={dashboard} snapshots={snapshots} />
      ) : (
        <PlanClient plans={plans} />
      )}
    </div>
  )
}
