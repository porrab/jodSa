import { createClient, getUser } from '@/lib/supabase/server'
import { computeCostBasis } from '@/lib/invest/cost-basis'
import {
  valueHolding,
  computeTotals,
  computeAllocation,
  computeConcentration,
  DISPLAY_CURRENCY,
  type HoldingInput,
} from '@/lib/invest/portfolio'
import type { AssetClass, Sleeve } from '@/lib/validators/invest'
import InvestTabs from './invest-tabs'

export default async function InvestPage() {
  const user = await getUser()
  if (!user) return null // defensive — app/(app)/layout.tsx already redirects unauthenticated

  const supabase = await createClient()

  // RLS scopes every query: holdings/asset_transactions to this user's own rows,
  // assets to (is_system OR user_id = this user) — see 0008_invest_holdings.sql.
  // Joined client-side (Map lookups), not via a PostgREST embed — matches this
  // repo's existing convention (see app/(app)/transactions/page.tsx) and sidesteps
  // supabase-js needing typed `Relationships` metadata for an embed to type-check.
  const [{ data: holdingsRaw }, { data: assets }, { data: txRaw }, { data: snapshotsRaw }] = await Promise.all([
    supabase.from('holdings').select('*').order('created_at'),
    supabase.from('assets').select('*').order('is_system', { ascending: false }).order('name'),
    supabase.from('asset_transactions').select('*').order('datetime'),
    supabase.from('portfolio_snapshots').select('*').order('taken_at', { ascending: false }).limit(20),
  ])

  const assetById = new Map((assets ?? []).map((a) => [a.id, a]))

  const txByHolding = new Map<string, NonNullable<typeof txRaw>>()
  for (const tx of txRaw ?? []) {
    const list = txByHolding.get(tx.holding_id) ?? []
    list.push(tx)
    txByHolding.set(tx.holding_id, list)
  }

  const holdings = (holdingsRaw ?? []).map((h) => {
    const transactions = txByHolding.get(h.id) ?? []
    const cb = computeCostBasis(
      transactions.map((t) => ({
        type: t.type,
        qty: t.qty,
        priceMinor: t.price_minor,
        feesMinor: t.fees_minor,
        datetime: t.datetime,
      })),
    )
    return {
      ...h,
      asset: assetById.get(h.asset_id) ?? null,
      transactions,
      // bigint isn't RSC-serializable — cross the server/client boundary as strings
      // (lib/invest/money.ts formatMoney() accepts string | number | bigint).
      costBasis: {
        qty: cb.qty,
        totalCostMinor: cb.totalCostMinor.toString(),
        avgCostMinor: cb.avgCostMinor?.toString() ?? null,
        realizedPnlMinor: cb.realizedPnlMinor.toString(),
        dividendsMinor: cb.dividendsMinor.toString(),
        feesMinor: cb.feesMinor.toString(),
      },
    }
  })

  // M3 — portfolio-wide aggregation (lib/invest/portfolio.ts), computed server-side
  // from the same live data as the holdings list above (never drifts from it).
  const holdingInputs: HoldingInput[] = (holdingsRaw ?? []).flatMap((h) => {
    const asset = assetById.get(h.asset_id)
    if (!asset) return []
    const transactions = (txByHolding.get(h.id) ?? []).map((t) => ({
      type: t.type,
      qty: t.qty,
      priceMinor: t.price_minor,
      feesMinor: t.fees_minor,
      fxRate: t.fx_rate,
      datetime: t.datetime,
    }))
    return [
      {
        holdingId: h.id,
        assetId: h.asset_id,
        assetClass: asset.asset_class as AssetClass,
        currency: asset.currency,
        sleeve: h.sleeve as Sleeve,
        currentValueMinor: h.current_value_minor,
        currentValueCurrency: h.current_value_currency,
        currentFxToDisplay: h.current_fx_to_display,
        transactions,
      },
    ]
  })

  const valuedRows = holdingInputs.map((h) => valueHolding(h))
  const totals = computeTotals(valuedRows)
  const allocationByClass = computeAllocation(valuedRows, 'assetClass')
  const allocationByCurrency = computeAllocation(valuedRows, 'currency')
  const allocationBySleeve = computeAllocation(valuedRows, 'sleeve')
  const concentration = computeConcentration(valuedRows)

  // Serialize bigint -> string for the client boundary.
  const dashboard = {
    displayCurrency: DISPLAY_CURRENCY,
    totals: {
      totalValueMinor: totals.totalValueMinor.toString(),
      totalCostMinor: totals.totalCostMinor.toString(),
      totalPnlMinor: totals.totalPnlMinor.toString(),
      pricedCount: totals.pricedCount,
      unpricedCount: totals.unpricedCount,
      excludedCount: totals.excludedCount,
      currency: totals.currency,
    },
    allocationByClass: allocationByClass.map((b) => ({ key: b.key, valueMinor: b.valueMinor.toString(), pct: b.pct })),
    allocationByCurrency: allocationByCurrency.map((b) => ({ key: b.key, valueMinor: b.valueMinor.toString(), pct: b.pct })),
    allocationBySleeve: allocationBySleeve.map((b) => ({ key: b.key, valueMinor: b.valueMinor.toString(), pct: b.pct })),
    concentration: {
      top: concentration.top.map((e) => ({ ...e, valueMinor: e.valueMinor.toString() })),
      top1Pct: concentration.top1Pct,
      anyConcentrated: concentration.anyConcentrated,
    },
    priceable: holdings.map((h) => ({
      holdingId: h.id,
      assetName: h.asset?.name ?? null,
      currency: h.asset?.currency ?? 'THB',
      currentValueMinor: h.current_value_minor,
      currentValueCurrency: h.current_value_currency,
      currentFxToDisplay: h.current_fx_to_display,
    })),
    // Concentration entries key by asset_id (post-aggregation, see lib/invest/portfolio.ts
    // aggregateByAsset), not holding_id — a separate name lookup avoids the mismatch.
    assetNames: Object.fromEntries((assets ?? []).map((a) => [a.id, a.name])),
  }

  return (
    <InvestTabs
      holdings={holdings}
      assets={assets ?? []}
      dashboard={dashboard}
      snapshots={snapshotsRaw ?? []}
    />
  )
}
