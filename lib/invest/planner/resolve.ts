/**
 * Step 0 of the planner pipeline: assert every holding is classified
 * (`asset_class` already required by M1; `proxy_class` is the new M5
 * requirement). An unclassified holding BLOCKS the plan — never silently
 * defaulted (per the portfolio-planner skill + 02-architecture.md).
 *
 * `assets.proxy_class` is null by default for every asset until explicitly
 * set. Migration 0009 backfills it for the 19 system-seeded reference assets
 * (see db/migrations/0009_invest_plans.sql); user-created custom assets are
 * classified via app/actions/invest/assets.ts's classifyAssetProxyClass,
 * surfaced by the plan UI when this function reports unclassified holdings.
 */
import type { AssetClass, Sleeve } from '@/lib/validators/invest'
import type { Database } from '@/lib/supabase/types'
import type { ResolvedHolding, ResolveResult, UnclassifiedHolding } from './types'
import { valueHolding, type HoldingInput } from '@/lib/invest/portfolio'

type Tables = Database['public']['Tables']

export type PlannerAssetData = Pick<
  Tables['assets']['Row'],
  'id' | 'symbol' | 'name' | 'asset_class' | 'currency' | 'proxy_class' | 'is_system'
>

export type PlannerHoldingData = Pick<
  Tables['holdings']['Row'],
  | 'id'
  | 'asset_id'
  | 'sleeve'
  | 'current_value_minor'
  | 'current_value_currency'
  | 'current_fx_to_display'
>

export type PlannerTransactionData = Pick<
  Tables['asset_transactions']['Row'],
  'holding_id' | 'type' | 'qty' | 'price_minor' | 'fees_minor' | 'fx_rate' | 'datetime'
>

export type ResolveInput = {
  holdingId: string
  assetId: string
  symbol: string | null
  name: string
  assetClass: AssetClass
  proxyClass: string | null
  sleeve: Sleeve
  isSystemAsset: boolean
  /** Already-valued, display-currency amount from lib/invest/portfolio.ts's valueHolding(). */
  valueMinor: bigint
}

export function resolveHoldings(inputs: ResolveInput[]): ResolveResult {
  const unclassified: UnclassifiedHolding[] = []
  const resolved: ResolvedHolding[] = []

  for (const h of inputs) {
    if (!h.proxyClass) {
      unclassified.push({
        holdingId: h.holdingId,
        assetId: h.assetId,
        name: h.name,
        // System-seeded assets are read-only to the user (RLS) — they can never
        // self-classify one; the app must backfill those instead. Only a
        // user-owned custom asset is fixable from the plan UI.
        isCustomAsset: !h.isSystemAsset,
      })
      continue
    }
    resolved.push({
      holdingId: h.holdingId,
      assetId: h.assetId,
      symbol: h.symbol,
      name: h.name,
      assetClass: h.assetClass,
      proxyClass: h.proxyClass,
      sleeve: h.sleeve,
      valueMinor: h.valueMinor,
    })
  }

  if (unclassified.length > 0) {
    return { ok: false, unclassified }
  }
  return { ok: true, holdings: resolved }
}

export function mapToResolveInputs(
  holdings: PlannerHoldingData[],
  assets: PlannerAssetData[],
  transactions: PlannerTransactionData[]
): ResolveInput[] {
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const txByHolding = new Map<string, PlannerTransactionData[]>()

  for (const tx of transactions) {
    const list = txByHolding.get(tx.holding_id) ?? []
    list.push(tx)
    txByHolding.set(tx.holding_id, list)
  }

  return holdings.flatMap((h) => {
    const asset = assetById.get(h.asset_id)
    if (!asset) return []

    const holdingTxs = txByHolding.get(h.id) ?? []
    const holdingInput: HoldingInput = {
      holdingId: h.id,
      assetId: h.asset_id,
      assetClass: asset.asset_class,
      currency: asset.currency,
      sleeve: h.sleeve,
      currentValueMinor: h.current_value_minor,
      currentValueCurrency: h.current_value_currency,
      currentFxToDisplay: h.current_fx_to_display,
      transactions: holdingTxs.map((t) => ({
        type: t.type,
        qty: t.qty,
        priceMinor: t.price_minor,
        feesMinor: t.fees_minor,
        fxRate: t.fx_rate,
        datetime: t.datetime,
      })),
    }

    const valued = valueHolding(holdingInput)
    // Exclude unconverted, unpriceable, AND fully sold (qty === 0) positions
    // from the plan pipeline entirely. This stops custom null-proxy closed
    // positions from blocking plan generation, while still blocking on active ones.
    if (valued.unconverted || valued.effectiveMinor === null || valued.qty === 0) {
      return []
    }

    return [
      {
        holdingId: h.id,
        assetId: h.asset_id,
        symbol: asset.symbol,
        name: asset.name,
        assetClass: asset.asset_class,
        proxyClass: asset.proxy_class,
        sleeve: h.sleeve,
        isSystemAsset: asset.is_system,
        valueMinor: valued.effectiveMinor,
      } satisfies ResolveInput,
    ]
  })
}
