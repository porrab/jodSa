/**
 * Portfolio-level aggregation for the M3 dashboard — total value, cost basis,
 * P&L, allocation (asset class / currency / sleeve), and concentration.
 *
 * Pure functions only (no I/O) so the money math is exhaustively unit-testable
 * against a hand-computed fixture, per the M3 acceptance criteria. Server
 * actions / RSC pages in app/(app)/invest and app/actions/invest/portfolio.ts
 * are the only callers that touch Supabase; they map DB rows into the
 * `HoldingInput` shape below and hand them to `valueHolding()`.
 *
 * ── Design decisions (M3, see REVIEW-INBOX.md SPEC-4 for the full writeup) ──
 *
 * 1. Display currency is fixed to THB. There is no per-user "display currency"
 *    setting in this app (no such column exists on `users`) — 02-architecture.md
 *    frames it as *a* user setting with THB as the default; M1's own UI already
 *    assumes THB is the target (see invest-client.tsx's `fxRateLabel`: "FX rate
 *    used ({currency} → THB)"). Building a real settings surface for this is out
 *    of M3's scope; `DISPLAY_CURRENCY` is the single point to change later.
 *
 * 2. FX-at-cost uses the *latest buy transaction's* `fx_rate` for the whole
 *    holding. `asset_transactions.fx_rate` is captured per-transaction
 *    (immutable at trade time) so it can in principle differ buy-to-buy, but
 *    JodSa Investments is a manual personal tracker, not a lot-level tax
 *    engine — approximating "the" cost-basis FX for a holding with its most
 *    recent buy's rate is simple, deterministic, and matches the money.test.ts
 *    M1 fixture exactly (that fixture only ever has one buy per holding).
 *
 * 3. FX-at-valuation uses `holdings.current_fx_to_display` (already captured
 *    by M1's "current value" edit form) exactly as 02-architecture.md
 *    specifies — no change needed there.
 *
 * 4. A holding with no `current_value_minor` set yet is valued **at cost**
 *    (implying zero P&L for that holding) rather than excluded — so portfolio
 *    totals are always a defined number, and "0 P&L until priced" is an
 *    honest default (never invents a gain/loss). `hasCurrentValue` on the
 *    result distinguishes "priced" from "valued at cost" for the UI.
 *
 * 5. A holding that *needs* an FX rate to reach the display currency but has
 *    none recorded (`unconverted: true`) is excluded from totals/allocation/
 *    concentration entirely (never silently assumed 1:1) and surfaced to the
 *    UI as a count so the user knows to go set it.
 *
 * 6. Concentration MUST first merge holding rows that share the same
 *    `asset_id` (`aggregateByAsset`) — per pm-desk's M1 forward-risk note,
 *    `holdings` has no `UNIQUE(user_id, asset_id, broker)`, so the same asset
 *    can exist as 2+ separate rows (e.g. bought via two brokers). Ranking raw
 *    holding rows instead of merged asset positions would under-report true
 *    concentration by splitting one position into several smaller ones.
 *    Allocation-by-class/currency/sleeve doesn't strictly need this merge
 *    (summation is associative either way) but concentration's top-N ranking
 *    absolutely does.
 */
import { parseMinor, convertMinor } from './money'
import { computeCostBasis, type CostBasisTransaction } from './cost-basis'
import type { AssetClass, Sleeve } from '@/lib/validators/invest'

export const DISPLAY_CURRENCY = 'THB'

export type PortfolioTransaction = CostBasisTransaction & {
  fxRate: string | number | null | undefined
}

export type HoldingInput = {
  holdingId: string
  assetId: string
  assetClass: AssetClass
  /** The asset's native currency (holdings/transactions are always in this currency). */
  currency: string
  sleeve: Sleeve
  currentValueMinor: string | number | bigint | null
  currentValueCurrency: string | null
  currentFxToDisplay: string | number | null
  transactions: PortfolioTransaction[]
}

export type ValuedHolding = {
  holdingId: string
  assetId: string
  assetClass: AssetClass
  currency: string
  sleeve: Sleeve
  qty: number
  /** Cost basis converted to the display currency; null if a required FX rate is missing. */
  costMinor: bigint | null
  hasCurrentValue: boolean
  /** Current value converted to the display currency; null if unset or unconvertible. */
  valueMinor: bigint | null
  /** valueMinor - costMinor, only when the holding is actually priced AND both convert cleanly. */
  pnlMinor: bigint | null
  /** valueMinor if priced, else costMinor (valued-at-cost fallback); null if unconvertible. */
  effectiveMinor: bigint | null
  /** True when a required FX rate is missing (excluded from totals/allocation/concentration). */
  unconverted: boolean
}

function latestBuyFxRate(transactions: PortfolioTransaction[]): number | null {
  const withFx = transactions
    .filter((t) => t.type === 'buy' && t.fxRate !== null && t.fxRate !== undefined && t.fxRate !== '')
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
  if (withFx.length === 0) return null
  const rate = Number(withFx[withFx.length - 1].fxRate)
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

/** Value one holding — cost basis + current value, both converted to the display currency. */
export function valueHolding(h: HoldingInput, displayCurrency: string = DISPLAY_CURRENCY): ValuedHolding {
  const display = displayCurrency.toUpperCase()
  const nativeCurrency = h.currency.toUpperCase()
  const cb = computeCostBasis(h.transactions)

  let costMinor: bigint | null
  let costUnconverted = false
  if (nativeCurrency === display) {
    costMinor = cb.totalCostMinor
  } else {
    const rate = latestBuyFxRate(h.transactions)
    if (rate === null) {
      costMinor = null
      costUnconverted = true
    } else {
      costMinor = convertMinor(cb.totalCostMinor, rate, nativeCurrency, display)
    }
  }

  const hasCurrentValue = h.currentValueMinor !== null && h.currentValueMinor !== undefined
  let valueMinor: bigint | null = null
  let valueUnconverted = false
  if (hasCurrentValue) {
    const valueCurrency = (h.currentValueCurrency ?? nativeCurrency).toUpperCase()
    const rawValue = parseMinor(h.currentValueMinor)
    if (valueCurrency === display) {
      valueMinor = rawValue
    } else {
      const fx =
        h.currentFxToDisplay !== null && h.currentFxToDisplay !== undefined
          ? Number(h.currentFxToDisplay)
          : NaN
      if (Number.isFinite(fx) && fx > 0) {
        valueMinor = convertMinor(rawValue, fx, valueCurrency, display)
      } else {
        valueUnconverted = true
      }
    }
  }

  const unconverted = costUnconverted || valueUnconverted
  const pnlMinor = hasCurrentValue && !unconverted && valueMinor !== null && costMinor !== null
    ? valueMinor - costMinor
    : null
  const effectiveMinor = unconverted ? null : hasCurrentValue ? valueMinor : costMinor

  return {
    holdingId: h.holdingId,
    assetId: h.assetId,
    assetClass: h.assetClass,
    currency: nativeCurrency,
    sleeve: h.sleeve,
    qty: cb.qty,
    costMinor,
    hasCurrentValue,
    valueMinor,
    pnlMinor,
    effectiveMinor,
    unconverted,
  }
}

export type PortfolioTotals = {
  totalValueMinor: bigint
  totalCostMinor: bigint
  totalPnlMinor: bigint
  pricedCount: number
  unpricedCount: number
  excludedCount: number
  currency: string
}

/** Sum priced/valued-at-cost holdings into portfolio-wide value/cost/P&L. */
export function computeTotals(rows: ValuedHolding[], displayCurrency: string = DISPLAY_CURRENCY): PortfolioTotals {
  let totalValue = 0n
  let totalCost = 0n
  let pricedCount = 0
  let unpricedCount = 0
  let excludedCount = 0

  for (const r of rows) {
    if (r.unconverted || r.effectiveMinor === null) {
      excludedCount += 1
      continue
    }
    totalValue += r.effectiveMinor
    if (r.costMinor !== null) totalCost += r.costMinor
    if (r.hasCurrentValue) pricedCount += 1
    else unpricedCount += 1
  }

  return {
    totalValueMinor: totalValue,
    totalCostMinor: totalCost,
    totalPnlMinor: totalValue - totalCost,
    pricedCount,
    unpricedCount,
    excludedCount,
    currency: displayCurrency.toUpperCase(),
  }
}

export type AllocationDimension = 'assetClass' | 'currency' | 'sleeve'

export type AllocationBucket = { key: string; valueMinor: bigint; pct: number }

/** Group by asset class / native currency / sleeve, each bucket's % of the convertible total. */
export function computeAllocation(rows: ValuedHolding[], dimension: AllocationDimension): AllocationBucket[] {
  const included = rows.filter((r) => !r.unconverted && r.effectiveMinor !== null)
  const total = included.reduce((sum, r) => sum + (r.effectiveMinor as bigint), 0n)
  const buckets = new Map<string, bigint>()

  for (const r of included) {
    const key = dimension === 'assetClass' ? r.assetClass : dimension === 'currency' ? r.currency : r.sleeve
    buckets.set(key, (buckets.get(key) ?? 0n) + (r.effectiveMinor as bigint))
  }

  return [...buckets.entries()]
    .map(([key, valueMinor]) => ({
      key,
      valueMinor,
      pct: total > 0n ? Number((valueMinor * 10000n) / total) / 100 : 0,
    }))
    .sort((a, b) => (b.valueMinor > a.valueMinor ? 1 : a.valueMinor > b.valueMinor ? -1 : 0))
}

export type AssetPosition = {
  assetId: string
  assetClass: AssetClass
  currency: string
  qty: number
  valueMinor: bigint
}

/**
 * Merge holding rows that share the same asset_id into one position — the
 * forward-risk fix (see file header #6). Excludes unconverted/unpriceable rows.
 */
export function aggregateByAsset(rows: ValuedHolding[]): AssetPosition[] {
  const map = new Map<string, AssetPosition>()
  for (const r of rows) {
    if (r.unconverted || r.effectiveMinor === null) continue
    const existing = map.get(r.assetId)
    if (existing) {
      existing.qty += r.qty
      existing.valueMinor += r.effectiveMinor
    } else {
      map.set(r.assetId, {
        assetId: r.assetId,
        assetClass: r.assetClass,
        currency: r.currency,
        qty: r.qty,
        valueMinor: r.effectiveMinor,
      })
    }
  }
  return [...map.values()]
}

export type ConcentrationEntry = { assetId: string; valueMinor: bigint; pct: number; concentrated: boolean }
export type ConcentrationResult = { top: ConcentrationEntry[]; top1Pct: number; anyConcentrated: boolean }

/** Top-N positions by % of the (asset-merged) portfolio; flags anything ≥ `threshold` (default 25%). */
export function computeConcentration(rows: ValuedHolding[], topN = 5, threshold = 0.25): ConcentrationResult {
  const positions = aggregateByAsset(rows)
  const total = positions.reduce((s, p) => s + p.valueMinor, 0n)

  const ranked = positions
    .map((p) => ({
      assetId: p.assetId,
      valueMinor: p.valueMinor,
      pct: total > 0n ? Number((p.valueMinor * 10000n) / total) / 100 : 0,
      concentrated: false,
    }))
    .sort((a, b) => (b.valueMinor > a.valueMinor ? 1 : a.valueMinor > b.valueMinor ? -1 : 0))
    .map((e) => ({ ...e, concentrated: e.pct >= threshold * 100 }))

  const top = ranked.slice(0, topN)
  return {
    top,
    top1Pct: top[0]?.pct ?? 0,
    anyConcentrated: top.some((e) => e.concentrated),
  }
}

// ── Snapshot serialization (portfolio_snapshots.holdings/totals/allocation jsonb) ──

export type SnapshotBucket = { key: string; valueMinor: string; pct: number }
export type SnapshotHoldingRow = {
  holdingId: string
  assetId: string
  qty: number
  costMinor: string
  valueMinor: string | null
  hasCurrentValue: boolean
  unconverted: boolean
}
export type SnapshotTotals = {
  valueMinor: string
  costMinor: string
  pnlMinor: string
  pricedCount: number
  unpricedCount: number
  excludedCount: number
  currency: string
}
export type SnapshotAllocation = {
  assetClass: SnapshotBucket[]
  currency: SnapshotBucket[]
  sleeve: SnapshotBucket[]
}
export type SnapshotPayload = {
  displayCurrency: string
  holdings: SnapshotHoldingRow[]
  totals: SnapshotTotals
  allocation: SnapshotAllocation
}

function serializeBuckets(buckets: AllocationBucket[]): SnapshotBucket[] {
  return buckets.map((b) => ({ key: b.key, valueMinor: b.valueMinor.toString(), pct: b.pct }))
}

/** bigint isn't JSON-serializable — build the exact jsonb shape written to portfolio_snapshots. */
export function buildSnapshotPayload(rows: ValuedHolding[], displayCurrency: string = DISPLAY_CURRENCY): SnapshotPayload {
  const totals = computeTotals(rows, displayCurrency)
  return {
    displayCurrency: totals.currency,
    holdings: rows.map((r) => ({
      holdingId: r.holdingId,
      assetId: r.assetId,
      qty: r.qty,
      costMinor: (r.costMinor ?? 0n).toString(),
      valueMinor: r.valueMinor !== null ? r.valueMinor.toString() : null,
      hasCurrentValue: r.hasCurrentValue,
      unconverted: r.unconverted,
    })),
    totals: {
      valueMinor: totals.totalValueMinor.toString(),
      costMinor: totals.totalCostMinor.toString(),
      pnlMinor: totals.totalPnlMinor.toString(),
      pricedCount: totals.pricedCount,
      unpricedCount: totals.unpricedCount,
      excludedCount: totals.excludedCount,
      currency: totals.currency,
    },
    allocation: {
      assetClass: serializeBuckets(computeAllocation(rows, 'assetClass')),
      currency: serializeBuckets(computeAllocation(rows, 'currency')),
      sleeve: serializeBuckets(computeAllocation(rows, 'sleeve')),
    },
  }
}
