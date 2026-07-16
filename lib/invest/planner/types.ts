/**
 * Types for the M5 AI Monthly Buy/Sell Planner — decision-support only, never
 * executes. See .claude/skills/portfolio-planner/SKILL.md for the pipeline and
 * Resources/portfolio-risk-review/portfolio-risk-methodology.md for the
 * underlying discipline (epistemic tags, capital-weight ≠ risk-weight, NO-TRADE
 * as a valid outcome, no false precision).
 */
import type { AssetClass, Sleeve } from '@/lib/validators/invest'

/** Epistemic tags per the fin-desk methodology — attach to every non-trivial number. */
export type EpistemicTag = 'FACT' | 'CALC' | 'INFER' | 'JUDG' | 'JUDG-PROXY' | 'APPROX' | 'MKT'

export type ProxyClass = string

/** One resolved holding (asset already classified) fed into the planner — already
 * converted to the display currency by lib/invest/portfolio.ts's valueHolding(). */
export type ResolvedHolding = {
  holdingId: string
  assetId: string
  symbol: string | null
  name: string
  assetClass: AssetClass
  /** Nullable only transiently — resolve.ts blocks the plan if any holding lacks this. */
  proxyClass: ProxyClass | null
  sleeve: Sleeve
  /** Value in the plan's display currency (already FX-converted, see valueHolding). */
  valueMinor: bigint
}

export type UnclassifiedHolding = {
  holdingId: string
  assetId: string
  name: string
  isCustomAsset: boolean // true if the user can classify it themselves (owner-scoped custom asset)
}

export type ResolveResult =
  | { ok: true; holdings: ResolvedHolding[] }
  | { ok: false; unclassified: UnclassifiedHolding[] }

export type TargetAllocation = Partial<Record<AssetClass, number>> // percentages, expected to sum ~100

export type AllocationDriftRow = {
  assetClass: AssetClass
  currentPct: number
  targetPct: number
  /** currentPct - targetPct. Positive = overweight, negative = underweight. */
  driftPct: number
}

export type AllocationDrift = {
  totalValueMinor: bigint
  rows: AllocationDriftRow[]
  tags: EpistemicTag[]
}

export type ConcentrationRow = {
  /** Symbol for a resolvable single-name; falls back to assetId for unnamed/custom assets. */
  key: string
  label: string
  pct: number
  concentrated: boolean
}

export type ConcentrationResult = {
  /** Top positions by raw capital weight (no look-through). */
  direct: ConcentrationRow[]
  /** Top single-name exposures after best-effort ETF/fund look-through (may exceed capital weight). */
  effective: ConcentrationRow[]
  /** ETFs/funds whose proxy_class has no look-through table entry — flagged opaque, not decomposed. */
  opaqueVehicles: { assetId: string; name: string; pct: number }[]
  threshold: number
  anyConcentrated: boolean
  tags: EpistemicTag[]
}

export type StressResult = {
  scenario: string
  label: string
  /** Point estimate portfolio impact, as a fraction (e.g. -0.12 = -12%). */
  pointEstimate: number
  /** Range around the point estimate — never a single false-precise number. */
  rangeLow: number
  rangeHigh: number
  tags: EpistemicTag[]
}

export type SuggestionAction = 'buy' | 'sell' | 'hold'

export type AmountRange = { minMinor: string; maxMinor: string; currency: string }

/** i18n params must be JSON-primitive (next-intl's ICU formatter + jsonb persistence). */
export type ReasonParams = Record<string, string | number>

export type Suggestion = {
  action: SuggestionAction
  assetClass: AssetClass
  /** Set when the suggestion targets a specific position (e.g. a concentration hold/sell). */
  assetId?: string
  assetLabel?: string
  amountRange?: AmountRange
  /** Canonical English one-line rationale — always present (persisted audit trail, hand-fixture tests). */
  rationale: string
  /** next-intl message key + params so the UI can render this rationale in th/en. Same content as `rationale`. */
  reasonKey: string
  reasonParams: ReasonParams
  tags: EpistemicTag[]
}

export type PlanVerdict = 'no_trade' | 'action'

export type Plan = {
  createdAt: string
  paramVersion: string
  displayCurrency: string
  newMoney: { minor: string; currency: string }
  targetAllocation: TargetAllocation
  totalValueMinor: string
  riskCapitalPct: number
  allocationDrift: AllocationDriftRow[]
  concentration: {
    direct: ConcentrationRow[]
    effective: ConcentrationRow[]
    opaqueVehicles: { assetId: string; name: string; pct: number }[]
    anyConcentrated: boolean
  }
  stress: StressResult[]
  suggestions: Suggestion[]
  verdict: PlanVerdict
  headline: string
  headlineKey: string
  headlineParams: ReasonParams
  disclaimer: string
}
