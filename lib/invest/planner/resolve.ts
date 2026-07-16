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
import type { ResolvedHolding, ResolveResult, UnclassifiedHolding } from './types'

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
