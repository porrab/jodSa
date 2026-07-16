/**
 * Step 2: top-N direct concentration + best-effort ETF/fund look-through —
 * "the kept good bone" per 02-architecture.md. Reproduces the M0-validation
 * finding generically: any ETF/fund whose proxy_class carries a known
 * constituent table contributes its capital weight × constituent weight to
 * that single name's EFFECTIVE exposure — so "a Thai S&P 500 fund is not
 * diversification, it's more S&P 500" falls out of the math rather than
 * being hard-coded to one fund.
 *
 * LOOKTHROUGH_BY_PROXY_CLASS is a static, versioned proxy table (NOT live ETF
 * holdings data — no market-data API in MVP). It's deliberately keyed by
 * proxy_class rather than by fund symbol so a Thai feeder fund tracking the
 * same index as a US ETF shares the same look-through, matching the M0
 * "double-counting" finding. Every number it produces is tagged
 * [JUDG-PROXY, APPROX] — approximate public index-constituent weights as of
 * the date below, not fetched, will drift over time.
 */
import type { AssetClass } from '@/lib/validators/invest'
import type { ConcentrationResult, ConcentrationRow, ResolvedHolding } from './types'

// Vehicle asset classes — a position here is a basket, not a single name, and
// is the only kind of holding eligible for look-through decomposition.
const VEHICLE_CLASSES: AssetClass[] = ['etf', 'thai_fund']

// As-of 2026-07, approximate public index-constituent weights [JUDG-PROXY, APPROX, Verify].
// Only covers proxy classes that plausibly hold names JodSa's seeded asset list
// also lets a user hold directly (so the "effective exposure" math has
// somewhere to land) — extend as more proxy classes/constituents are added.
// Note: only VEHICLE_CLASSES (etf/thai_fund) ever look this table up — an
// individually-held stock classified `us_tech_growth` (e.g. a direct NVDA
// position) is not a vehicle and never self-decomposes.
const LOOKTHROUGH_BY_PROXY_CLASS: Record<string, Record<string, number>> = {
  us_large_cap: { NVDA: 0.07, AAPL: 0.06, MSFT: 0.06, AMZN: 0.04 },
  us_tech_growth: { NVDA: 0.09, AAPL: 0.08, MSFT: 0.08, AMZN: 0.05 },
}

function sumMinor(rows: { valueMinor: bigint }[]): bigint {
  return rows.reduce((s, r) => s + r.valueMinor, 0n)
}

function pctOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0
  return Number((part * 10000n) / total) / 100
}

function keyFor(h: ResolvedHolding): string {
  return h.symbol ?? h.assetId
}

function labelFor(h: ResolvedHolding): string {
  return h.symbol ? `${h.symbol} · ${h.name}` : h.name
}

export function computeConcentration(
  holdings: ResolvedHolding[],
  topN = 5,
  threshold = 25,
): ConcentrationResult {
  const total = sumMinor(holdings)

  // ── Direct: raw capital weight, no look-through ────────────────────────
  const directMap = new Map<string, { label: string; valueMinor: bigint }>()
  for (const h of holdings) {
    const key = keyFor(h)
    const existing = directMap.get(key)
    if (existing) existing.valueMinor += h.valueMinor
    else directMap.set(key, { label: labelFor(h), valueMinor: h.valueMinor })
  }
  const direct: ConcentrationRow[] = [...directMap.entries()]
    .map(([key, v]) => ({ key, label: v.label, pct: pctOf(v.valueMinor, total), concentrated: false }))
    .sort((a, b) => b.pct - a.pct)
    .map((r) => ({ ...r, concentrated: r.pct >= threshold }))

  // ── Effective: direct weight + look-through-attributed weight ──────────
  const effectiveMinor = new Map<string, bigint>() // symbol -> extra minor attributed via look-through
  const effectiveLabel = new Map<string, string>()
  const opaqueVehicles: { assetId: string; name: string; pct: number }[] = []

  for (const h of holdings) {
    // Every holding starts as itself (single names AND vehicles both count
    // their own capital weight — look-through ADDS exposure, it doesn't
    // replace the fund's own line item).
    const key = keyFor(h)
    effectiveMinor.set(key, (effectiveMinor.get(key) ?? 0n) + h.valueMinor)
    effectiveLabel.set(key, labelFor(h))

    if (VEHICLE_CLASSES.includes(h.assetClass)) {
      const table = h.proxyClass ? LOOKTHROUGH_BY_PROXY_CLASS[h.proxyClass] : undefined
      if (!table) {
        opaqueVehicles.push({ assetId: h.assetId, name: h.name, pct: pctOf(h.valueMinor, total) })
        continue
      }
      for (const [constituentSymbol, weight] of Object.entries(table)) {
        // Weight is a fraction of the vehicle's own value (e.g. NVDA is ~7% of
        // this ETF's basket) — attribute that share of THIS holding's minor
        // value to the constituent's effective exposure. Uses `number` math
        // (not bigint) because the weight itself is an approximate proxy, not
        // an exact figure — precision beyond a proxy input would be false.
        const attributed = BigInt(Math.round(Number(h.valueMinor) * weight))
        effectiveMinor.set(constituentSymbol, (effectiveMinor.get(constituentSymbol) ?? 0n) + attributed)
        if (!effectiveLabel.has(constituentSymbol)) effectiveLabel.set(constituentSymbol, constituentSymbol)
      }
    }
  }

  const effective: ConcentrationRow[] = [...effectiveMinor.entries()]
    .map(([key, valueMinor]) => ({
      key,
      label: effectiveLabel.get(key) ?? key,
      pct: pctOf(valueMinor, total),
      concentrated: false,
    }))
    .sort((a, b) => b.pct - a.pct)
    .map((r) => ({ ...r, concentrated: r.pct >= threshold }))

  const anyConcentrated = effective.some((r) => r.concentrated) || direct.some((r) => r.concentrated)

  return {
    direct: direct.slice(0, topN),
    effective: effective.slice(0, topN),
    opaqueVehicles,
    threshold,
    anyConcentrated,
    tags: ['CALC', 'JUDG-PROXY', 'APPROX'],
  }
}
