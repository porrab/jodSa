/**
 * Step 4 + orchestrator: combine drift + concentration + stress + the
 * new-money cadence into buy/sell/hold suggestions, then hand off to
 * verdict.ts. Pure & deterministic — same `holdings` + `targetAllocation` +
 * `newMoneyMinor` + `createdAt` + `proxy-params.json` (pinned by
 * `param_version`) ⇒ identical `Plan` (see tests/unit/invest/planner/*.test.ts
 * determinism assertion).
 *
 * Suggestion policy (deliberately conservative — mirrors the methodology's
 * STEP 4 action hierarchy, "cash-flow rebalance before selling"):
 *  - BUY: an asset_class underweight its target by ≥ UNDERWEIGHT_THRESHOLD
 *    points gets a share of the new money, proportional to its gap size.
 *    Never buys into a class currently carrying a concentrated position
 *    (would deepen the exact problem being flagged) or into `risk_capital`
 *    holdings (never suggested as "investing", per the non-negotiable rule).
 *  - HOLD (concentration flag): any position ≥ the concentration threshold
 *    (direct or look-through-effective) gets a "don't add, don't sell yet"
 *    suggestion — the default response to concentration, matching the M0
 *    NO-SELL finding (dilute with new money first).
 *  - SELL: only emitted when a position's DIRECT capital weight is itself
 *    very large (≥ SELL_DIRECT_THRESHOLD) AND its asset_class is overweight
 *    target by a lot (≥ SELL_DRIFT_THRESHOLD) — i.e. concentration alone
 *    never triggers a sell; a small book with a good look-through story
 *    still lands on HOLD (see fixture-1 in test-cases.md).
 *  - NO-TRADE is reachable: if no BUY/SELL is triggered (all drift within
 *    threshold, nothing concentrated), suggestions is empty and verdict.ts
 *    renders NO-TRADE — never a manufactured finding.
 */
import { ASSET_CLASSES } from '@/lib/validators/invest'
import { computeAllocationDrift } from './allocation'
import { computeConcentration } from './concentration'
import { computeStress } from './stress'
import { buildVerdict } from './verdict'
import { normalizeTags } from './tags'
import proxyParams from './proxy-params.json'
import type { AllocationDriftRow, Plan, ResolvedHolding, Suggestion, TargetAllocation } from './types'

export const UNDERWEIGHT_THRESHOLD = 5 // pts below target to trigger a buy suggestion
export const SELL_DIRECT_THRESHOLD = 30 // % direct capital weight of one name to even consider a sell
export const SELL_DRIFT_THRESHOLD = 15 // pts overweight the asset_class must also be, for a sell

function riskCapitalPct(holdings: ResolvedHolding[], total: bigint): number {
  if (total <= 0n) return 0
  const risk = holdings.filter((h) => h.sleeve === 'risk_capital').reduce((s, h) => s + h.valueMinor, 0n)
  return Number((risk * 10000n) / total) / 100
}

function distributeNewMoney(
  underweightRows: AllocationDriftRow[],
  concentratedClasses: Set<string>,
  newMoneyMinor: bigint,
  currency: string,
): Suggestion[] {
  const eligible = underweightRows.filter((r) => !concentratedClasses.has(r.assetClass))
  if (eligible.length === 0 || newMoneyMinor <= 0n) return []
  const gapSum = eligible.reduce((s, r) => s + Math.abs(r.driftPct), 0)
  if (gapSum <= 0) return []

  let allocated = 0n
  return eligible.map((row, i) => {
    const isLast = i === eligible.length - 1
    const share = Math.abs(row.driftPct) / gapSum
    const amount = isLast ? newMoneyMinor - allocated : BigInt(Math.round(Number(newMoneyMinor) * share))
    allocated += amount
    const gap = Math.abs(row.driftPct)
    return {
      action: 'buy',
      assetClass: row.assetClass,
      amountRange: { minMinor: amount.toString(), maxMinor: amount.toString(), currency },
      rationale: `${row.assetClass} is ${gap.toFixed(1)}pt below target (${row.currentPct.toFixed(1)}% vs ${row.targetPct.toFixed(1)}% target) — directing new money here narrows the gap without selling anything.`,
      reasonKey: 'reason.buyUnderweight',
      reasonParams: {
        assetClass: row.assetClass,
        gap: Math.round(gap * 10) / 10,
        currentPct: Math.round(row.currentPct * 10) / 10,
        targetPct: Math.round(row.targetPct * 10) / 10,
      },
      tags: normalizeTags(['CALC']),
    } satisfies Suggestion
  })
}

export type BuildPlanInput = {
  holdings: ResolvedHolding[]
  targetAllocation: TargetAllocation
  newMoneyMinor: bigint
  newMoneyCurrency: string
  displayCurrency: string
  /** ISO datetime, supplied by the caller — keeps this function pure/deterministic. */
  createdAt: string
}

export function buildPlan(input: BuildPlanInput): Plan {
  const { holdings, targetAllocation, newMoneyMinor, newMoneyCurrency, displayCurrency, createdAt } = input

  const drift = computeAllocationDrift(holdings, targetAllocation)
  const concentration = computeConcentration(holdings)
  const stress = computeStress(holdings)
  const riskPct = riskCapitalPct(holdings, drift.totalValueMinor)

  const underweight = drift.rows.filter((r) => r.driftPct <= -UNDERWEIGHT_THRESHOLD)
  const concentratedRows = [...concentration.direct, ...concentration.effective].filter((r) => r.concentrated)

  // Map a concentrated single-name row back to the asset_class(es) it belongs
  // to, so BUY suggestions never deepen a class that's already flagged.
  const concentratedAssetClasses = new Set<string>()
  const concentratedHoldingByKey = new Map(holdings.map((h) => [h.symbol ?? h.assetId, h]))
  for (const row of concentratedRows) {
    const h = concentratedHoldingByKey.get(row.key)
    if (h) concentratedAssetClasses.add(h.assetClass)
  }

  const buys = distributeNewMoney(underweight, concentratedAssetClasses, newMoneyMinor, newMoneyCurrency)

  // HOLD / SELL suggestions — one per concentrated single-name row, deduped
  // (a name can appear in both `direct` and `effective` — keep the richer,
  // effective-based one when both fire for the same key).
  const seenKeys = new Set<string>()
  const holdOrSell: Suggestion[] = []
  const effectiveKeys = new Set(concentration.effective.filter((r) => r.concentrated).map((r) => r.key))
  const rowsToProcess = [
    ...concentration.effective.filter((r) => r.concentrated),
    ...concentration.direct.filter((r) => r.concentrated && !effectiveKeys.has(r.key)),
  ]

  for (const row of rowsToProcess) {
    if (seenKeys.has(row.key)) continue
    seenKeys.add(row.key)
    const h = concentratedHoldingByKey.get(row.key)
    const assetClass = h?.assetClass ?? ASSET_CLASSES[0]
    const directPct = concentration.direct.find((d) => d.key === row.key)?.pct ?? row.pct
    const classDrift = drift.rows.find((d) => d.assetClass === assetClass)?.driftPct ?? 0

    const shouldSell = directPct >= SELL_DIRECT_THRESHOLD && classDrift >= SELL_DRIFT_THRESHOLD
    if (shouldSell) {
      holdOrSell.push({
        action: 'sell',
        assetClass,
        assetId: h?.assetId,
        assetLabel: row.label,
        rationale: `${row.label} is ${directPct.toFixed(1)}% of the portfolio directly, and ${assetClass} is ${classDrift.toFixed(1)}pt over target — trimming toward the target band is worth the transaction cost at this size.`,
        reasonKey: 'reason.sellConcentrated',
        reasonParams: {
          label: row.label,
          directPct: Math.round(directPct * 10) / 10,
          assetClass,
          classDrift: Math.round(classDrift * 10) / 10,
        },
        tags: normalizeTags(['CALC', 'JUDG-PROXY']),
      })
    } else {
      holdOrSell.push({
        action: 'hold',
        assetClass,
        assetId: h?.assetId,
        assetLabel: row.label,
        rationale: `${row.label} is ~${row.pct.toFixed(1)}% effective exposure (incl. look-through) — above the ${concentration.threshold}% flag, but not large or overweight enough yet to justify a sell. Dilute with new money first; do not sell just because it has gained.`,
        reasonKey: 'reason.holdConcentrated',
        reasonParams: {
          label: row.label,
          effectivePct: Math.round(row.pct * 10) / 10,
          threshold: concentration.threshold,
        },
        tags: normalizeTags(['CALC', 'JUDG-PROXY', 'APPROX']),
      })
    }
  }

  const suggestions = [...buys, ...holdOrSell]
  const verdict = buildVerdict(suggestions)

  return {
    createdAt,
    paramVersion: proxyParams.paramVersion,
    displayCurrency,
    newMoney: { minor: newMoneyMinor.toString(), currency: newMoneyCurrency },
    targetAllocation,
    totalValueMinor: drift.totalValueMinor.toString(),
    riskCapitalPct: riskPct,
    allocationDrift: drift.rows,
    concentration: {
      direct: concentration.direct,
      effective: concentration.effective,
      opaqueVehicles: concentration.opaqueVehicles,
      anyConcentrated: concentration.anyConcentrated,
    },
    stress,
    suggestions,
    verdict: verdict.verdict,
    headline: verdict.headline,
    headlineKey: verdict.headlineKey,
    headlineParams: verdict.headlineParams,
    disclaimer: verdict.disclaimer,
  }
}
