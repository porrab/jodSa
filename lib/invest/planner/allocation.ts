/**
 * Step 1: current allocation by asset_class + drift vs the user's target
 * allocation (percentages, snapshotted into the plan for reproducibility).
 *
 * Dimension choice: asset_class (not sleeve/currency) — it's the dimension a
 * monthly "where does new money go" decision actually acts on (e.g. "steer
 * money to gold/thai_set, not more etf/us_equity" — the exact M0-validated
 * finding). Sleeve is still surfaced separately (riskCapitalPct in plan.ts)
 * for the 100%-losable flag, which is a different concern from allocation
 * drift.
 */
import { ASSET_CLASSES, type AssetClass } from '@/lib/validators/invest'
import type { AllocationDrift, AllocationDriftRow, ResolvedHolding, TargetAllocation } from './types'

/** Sum of a bigint field, exact — no float accumulation. */
function sumMinor(rows: { valueMinor: bigint }[]): bigint {
  return rows.reduce((s, r) => s + r.valueMinor, 0n)
}

function pctOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0
  // bigint-exact to 2dp, then to a plain number for display/comparison — same
  // rounding approach as lib/invest/portfolio.ts's computeAllocation.
  return Number((part * 10000n) / total) / 100
}

/** Even split across every asset class with a nonzero current holding, else
 * an even split across all classes — a reasonable prefill, not a recommendation. */
export function defaultTargetAllocation(holdings: ResolvedHolding[]): TargetAllocation {
  const present = new Set(holdings.filter((h) => h.valueMinor > 0n).map((h) => h.assetClass))
  const classes = present.size > 0 ? [...present] : [...ASSET_CLASSES]
  const share = Math.round((100 / classes.length) * 10) / 10
  const out: TargetAllocation = {}
  let assigned = 0
  classes.forEach((c, i) => {
    const pct = i === classes.length - 1 ? Math.round((100 - assigned) * 10) / 10 : share
    out[c] = pct
    assigned += pct
  })
  return out
}

export function computeAllocationDrift(holdings: ResolvedHolding[], target: TargetAllocation): AllocationDrift {
  const total = sumMinor(holdings)
  const byClass = new Map<AssetClass, bigint>()
  for (const c of ASSET_CLASSES) byClass.set(c, 0n)
  for (const h of holdings) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0n) + h.valueMinor)

  const rows: AllocationDriftRow[] = ASSET_CLASSES.map((assetClass) => {
    const currentPct = pctOf(byClass.get(assetClass) ?? 0n, total)
    const targetPct = target[assetClass] ?? 0
    return {
      assetClass,
      currentPct,
      targetPct,
      driftPct: Math.round((currentPct - targetPct) * 100) / 100,
    }
  })

  return { totalValueMinor: total, rows, tags: ['CALC'] }
}
