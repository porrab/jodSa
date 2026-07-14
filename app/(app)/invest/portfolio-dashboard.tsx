'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AlertTriangle, Camera, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { updatePortfolioPrices, savePortfolioSnapshot } from '@/app/actions/invest/portfolio'
import { formatMoney, parseMinor, toMajor, minorUnitDecimals } from '@/lib/invest/money'
import LazyAllocationPieChart from '@/components/charts/lazy-allocation-pie-chart'
import type { AssetClass, Sleeve } from '@/lib/validators/invest'

type Bucket = { key: string; valueMinor: string; pct: number }

export type DashboardData = {
  displayCurrency: string
  totals: {
    totalValueMinor: string
    totalCostMinor: string
    totalPnlMinor: string
    pricedCount: number
    unpricedCount: number
    excludedCount: number
    currency: string
  }
  allocationByClass: Bucket[]
  allocationByCurrency: Bucket[]
  allocationBySleeve: Bucket[]
  concentration: {
    top: { assetId: string; valueMinor: string; pct: number; concentrated: boolean }[]
    top1Pct: number
    anyConcentrated: boolean
  }
  priceable: {
    holdingId: string
    assetName: string | null
    currency: string
    currentValueMinor: string | null
    currentValueCurrency: string | null
    currentFxToDisplay: string | null
  }[]
  assetNames: Record<string, string>
}

export type SnapshotRow = {
  id: string
  taken_at: string
  display_currency: string
  totals: unknown
  allocation: unknown
}

type SnapshotTotals = {
  valueMinor: string
  costMinor: string
  pnlMinor: string
  pricedCount: number
  unpricedCount: number
  excludedCount: number
  currency: string
}
type SnapshotAllocation = { assetClass: Bucket[]; currency: Bucket[]; sleeve: Bucket[] }

function assetIdToName(dashboard: DashboardData, assetId: string): string {
  return dashboard.assetNames[assetId] ?? assetId
}

function bucketsToSlices(buckets: Bucket[], labelFor: (key: string) => string) {
  return buckets.map((b) => ({ label: labelFor(b.key), value: Number(b.valueMinor), pct: b.pct }))
}

/** "Update prices" bulk form (M3): one row per holding, current value + FX where needed. */
function UpdatePricesSheet({
  priceable,
  displayCurrency,
  open,
  onOpenChange,
}: {
  priceable: DashboardData['priceable']
  displayCurrency: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('invest')
  const tc = useTranslations('common')
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      priceable.map((p) => [
        p.holdingId,
        p.currentValueMinor
          ? toMajor(parseMinor(p.currentValueMinor), p.currentValueCurrency ?? p.currency).toFixed(
              minorUnitDecimals(p.currentValueCurrency ?? p.currency),
            )
          : '',
      ]),
    ),
  )
  const [fx, setFx] = useState<Record<string, string>>(() =>
    Object.fromEntries(priceable.map((p) => [p.holdingId, p.currentFxToDisplay ?? ''])),
  )

  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      const entries = priceable
        .map((p) => {
          const raw = values[p.holdingId]?.trim()
          if (!raw) return null
          const currentValue = parseFloat(raw.replace(/,/g, ''))
          if (!Number.isFinite(currentValue) || currentValue < 0) return null
          const needsFx = p.currency.toUpperCase() !== displayCurrency.toUpperCase()
          const fxRaw = fx[p.holdingId]?.trim()
          const currentFxToDisplay = needsFx && fxRaw ? parseFloat(fxRaw) : undefined
          return {
            holdingId: p.holdingId,
            currentValue,
            currentValueCurrency: p.currency,
            ...(currentFxToDisplay !== undefined ? { currentFxToDisplay } : {}),
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)

      if (entries.length === 0) return { error: t('noPricesToUpdate') }
      fd.set('entries', JSON.stringify(entries))
      const result = await updatePortfolioPrices(prev, fd)
      if (!result.error) {
        toast.success(t('pricesUpdated'))
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
      return result
    },
    { error: '' },
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t('updatePrices')}</SheetTitle>
        </SheetHeader>
        <form action={formAction} className="space-y-3 px-4 pb-6">
          {priceable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noHoldings')}</p>
          ) : (
            priceable.map((p) => {
              const needsFx = p.currency.toUpperCase() !== displayCurrency.toUpperCase()
              return (
                <div key={p.holdingId} className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">{p.assetName ?? t('unknownAsset')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`pv-${p.holdingId}`}>{t('currentValueLabel', { currency: p.currency })}</Label>
                      <Input
                        id={`pv-${p.holdingId}`}
                        type="text"
                        inputMode="decimal"
                        className="tabular-nums"
                        value={values[p.holdingId] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [p.holdingId]: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                    {needsFx && (
                      <div className="space-y-1">
                        <Label htmlFor={`fx-${p.holdingId}`}>{t('fxRateLabel', { currency: p.currency })}</Label>
                        <Input
                          id={`fx-${p.holdingId}`}
                          type="text"
                          inputMode="decimal"
                          className="tabular-nums"
                          value={fx[p.holdingId] ?? ''}
                          onChange={(e) => setFx((v) => ({ ...v, [p.holdingId]: e.target.value }))}
                          placeholder="36.50"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={isPending || priceable.length === 0}>
            {isPending ? tc('saving') : tc('save')}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function SnapshotDetail({ snapshot, onClose }: { snapshot: SnapshotRow; onClose: () => void }) {
  const t = useTranslations('invest')
  const totals = snapshot.totals as SnapshotTotals
  const allocation = snapshot.allocation as SnapshotAllocation

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{new Date(snapshot.taken_at).toLocaleString('th-TH')}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="space-y-1">
            <p className="text-2xl font-bold tabular-nums text-focal">
              {formatMoney(totals.valueMinor, totals.currency)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('costBasisLine', { amount: formatMoney(totals.costMinor, totals.currency) })}
            </p>
            <p
              className={`text-sm font-medium tabular-nums ${BigInt(totals.pnlMinor) < 0n ? 'text-destructive' : 'text-primary'}`}
            >
              {t('pnlLine', { amount: formatMoney(totals.pnlMinor, totals.currency) })}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('allocationByClass')}</p>
            {allocation.assetClass.map((b) => (
              <div key={b.key} className="flex items-center justify-between text-sm">
                <span>{t(`assetClass.${b.key as AssetClass}`)}</span>
                <span className="tabular-nums">{b.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** M3 — total value/cost/P&L, allocation (class/currency/sleeve), concentration, price updates, snapshot history. */
export default function PortfolioDashboard({
  dashboard,
  snapshots,
}: {
  dashboard: DashboardData
  snapshots: SnapshotRow[]
}) {
  const t = useTranslations('invest')
  const tc = useTranslations('common')
  const [pricesOpen, setPricesOpen] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotRow | null>(null)

  const [snapState, snapAction, snapPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      const result = await savePortfolioSnapshot(prev, fd)
      if (!result.error) toast.success(t('snapshotSaved'))
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  const pnl = BigInt(dashboard.totals.totalPnlMinor)
  const hasAnyValue = dashboard.priceable.length > 0

  const classLabel = (key: string) => t(`assetClass.${key as AssetClass}`)
  const sleeveLabel = (key: string) => t(`sleeve.${key as Sleeve}`)
  const currencyLabel = (key: string) => key

  return (
    <div className="space-y-4">
      {!hasAnyValue ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>{t('noHoldings')}</p>
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-2 pt-4">
              <p className="text-xs text-muted-foreground">{t('totalValueLabel', { currency: dashboard.displayCurrency })}</p>
              <p className="text-2xl font-bold tabular-nums text-focal">
                {formatMoney(dashboard.totals.totalValueMinor, dashboard.totals.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('costBasisLine', { amount: formatMoney(dashboard.totals.totalCostMinor, dashboard.totals.currency) })}
              </p>
              <p className={`text-sm font-medium tabular-nums ${pnl < 0n ? 'text-destructive' : 'text-primary'}`}>
                {t('pnlLine', { amount: formatMoney(dashboard.totals.totalPnlMinor, dashboard.totals.currency) })}
              </p>
              {dashboard.totals.unpricedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('unpricedNote', { count: dashboard.totals.unpricedCount })}
                </p>
              )}
              {dashboard.totals.excludedCount > 0 && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" />
                  {t('excludedFxNote', { count: dashboard.totals.excludedCount })}
                </p>
              )}
            </CardContent>
          </Card>

          {dashboard.concentration.top.length > 0 && (
            <Card>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{t('concentrationTitle')}</p>
                  {dashboard.concentration.anyConcentrated && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="mr-1 size-3" />
                      {t('concentratedBadge')}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5">
                  {dashboard.concentration.top.map((e) => (
                    <div key={e.assetId} className="flex items-center justify-between text-sm">
                      <span className="truncate">{assetIdToName(dashboard, e.assetId)}</span>
                      <span className={`tabular-nums ${e.concentrated ? 'font-semibold text-destructive' : ''}`}>
                        {e.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-3 pt-4">
              <p className="text-sm font-medium">{t('allocationByClass')}</p>
              <LazyAllocationPieChart data={bucketsToSlices(dashboard.allocationByClass, classLabel)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-4">
              <p className="text-sm font-medium">{t('allocationByCurrency')}</p>
              <LazyAllocationPieChart data={bucketsToSlices(dashboard.allocationByCurrency, currencyLabel)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-4">
              <p className="text-sm font-medium">{t('allocationBySleeve')}</p>
              <LazyAllocationPieChart data={bucketsToSlices(dashboard.allocationBySleeve, sleeveLabel)} />
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setPricesOpen(true)}>
          <RefreshCw className="mr-1.5 size-4" />
          {t('updatePrices')}
        </Button>
        <form action={snapAction}>
          <Button type="submit" variant="outline" className="w-full" disabled={snapPending}>
            <Camera className="mr-1.5 size-4" />
            {snapPending ? tc('saving') : t('saveSnapshot')}
          </Button>
        </form>
      </div>
      {snapState.error && <p className="text-sm text-destructive">{snapState.error}</p>}

      {snapshots.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <p className="text-sm font-medium">{t('snapshotHistory')}</p>
            <div className="divide-y rounded-lg border">
              {snapshots.map((s) => {
                const totals = s.totals as SnapshotTotals
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSnapshot(s)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <span>{new Date(s.taken_at).toLocaleString('th-TH')}</span>
                    <span className="tabular-nums">{formatMoney(totals.valueMinor, totals.currency)}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <UpdatePricesSheet
        priceable={dashboard.priceable}
        displayCurrency={dashboard.displayCurrency}
        open={pricesOpen}
        onOpenChange={setPricesOpen}
      />

      {selectedSnapshot && <SnapshotDetail snapshot={selectedSnapshot} onClose={() => setSelectedSnapshot(null)} />}
    </div>
  )
}
