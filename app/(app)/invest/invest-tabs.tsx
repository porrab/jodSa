'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PageTabs, PageTab } from '@/components/ui/page-tabs'
import InvestClient, { AddHoldingSheet, type Holding, type Asset } from './invest-client'
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
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-4">
      <PageHeader
        className="[&_h1]:whitespace-nowrap"
        title={t('title')}
        action={<Button className="shrink-0" aria-label={t('addHolding')} onClick={() => setAddOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          <span className="min-[360px]:hidden">{t('addShort')}</span>
          <span className="hidden min-[360px]:inline">{t('addHolding')}</span>
        </Button>}
      />
      <PageTabs className="grid-cols-3">
        {(['holdings', 'overview', 'plan'] as const).map((tb) => (
          <PageTab
            key={tb}
            className="whitespace-nowrap"
            onClick={() => setTab(tb)}
            active={tab === tb}
          >
            {tb === 'holdings' ? t('tabHoldings') : tb === 'overview' ? t('tabOverview') : t('tabPlan')}
          </PageTab>
        ))}
      </PageTabs>
      <AddHoldingSheet assets={assets} open={addOpen} onOpenChange={setAddOpen} />

      {tab === 'holdings' ? (
        <InvestClient holdings={holdings} assets={assets} accounts={accounts} initialHoldingId={initialHoldingId} totals={dashboard.totals} />
      ) : tab === 'overview' ? (
        <PortfolioDashboard dashboard={dashboard} snapshots={snapshots} />
      ) : (
        <PlanClient plans={plans} />
      )}
    </div>
  )
}
