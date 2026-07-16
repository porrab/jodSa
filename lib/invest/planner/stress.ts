/**
 * Step 3: 1-2 proxy scenario shocks. Portfolio-wide impact = Σ (asset-class
 * weight × that class's proxy_class stress factor) — a standalone weighted
 * sum, NOT correlation-adjusted (that's Phase 2, per 02-architecture.md).
 *
 * Presented as a RANGE, never a single point number: proxy stress factors are
 * illustrative point assumptions from the methodology's "Simulation
 * Assumptions" defaults, not a fitted distribution, so collapsing them to one
 * decimal would be false precision. The range here is a fixed ±15% relative
 * band around the point estimate — a documented, simple honesty device (not a
 * statistical confidence interval).
 */
import type { ResolvedHolding, StressResult } from './types'
import proxyParams from './proxy-params.json'

type StressScenarioKey = keyof typeof proxyParams.stressScenarios

const RANGE_BAND = 0.15 // ±15% relative fuzz around the point estimate

function sumMinor(rows: { valueMinor: bigint }[]): bigint {
  return rows.reduce((s, r) => s + r.valueMinor, 0n)
}

/** Run every stress scenario in proxy-params.json against the resolved holdings. */
export function computeStress(holdings: ResolvedHolding[]): StressResult[] {
  const total = sumMinor(holdings)
  if (total <= 0n) return []

  const weightByProxyClass = new Map<string, number>()
  for (const h of holdings) {
    const w = Number(h.valueMinor) / Number(total)
    weightByProxyClass.set(h.proxyClass ?? '', (weightByProxyClass.get(h.proxyClass ?? '') ?? 0) + w)
  }

  const scenarios = Object.entries(proxyParams.stressScenarios) as [
    StressScenarioKey,
    (typeof proxyParams.stressScenarios)[StressScenarioKey],
  ][]

  return scenarios.map(([key, scenario]) => {
    let point = 0
    for (const [proxyClass, weight] of weightByProxyClass) {
      const factor = (scenario.factors as Record<string, number>)[proxyClass]
      // Missing factor (an unmapped proxy_class) contributes 0 — never a guess.
      point += weight * (factor ?? 0)
    }
    const point2dp = Math.round(point * 10000) / 10000
    const bandA = Math.round(point2dp * (1 + RANGE_BAND) * 10000) / 10000
    const bandB = Math.round(point2dp * (1 - RANGE_BAND) * 10000) / 10000
    return {
      scenario: key,
      label: scenario.label,
      pointEstimate: point2dp,
      rangeLow: Math.min(bandA, bandB),
      rangeHigh: Math.max(bandA, bandB),
      tags: ['JUDG-PROXY', 'APPROX'],
    }
  })
}
