/**
 * Cost-basis derivation from asset_transactions — the M1 acceptance's
 * "cost-basis derivation from transactions" requirement.
 *
 * Design decision (see db/migrations/0008_invest_holdings.sql header): `holdings`
 * carries no stored avg-cost column. Qty and remaining cost basis are always
 * computed live from the transaction ledger with a weighted-average-cost method
 * (not lot-specific / FIFO) — same method JodSa's balance math uses elsewhere
 * (fold over ordered rows), simplest correct answer for a personal tracker.
 *
 * All money arithmetic is bigint (see lib/invest/money.ts) except the intermediate
 * per-unit average, which necessarily needs a fractional value (qty may be
 * fractional — crypto, Dime fractional shares) — that intermediate is a plain
 * JS `number` and is only ever used to compute the next bigint-rounded total, never
 * stored or returned as a source of truth itself.
 */
import { parseMinor } from './money'

export type AssetTransactionType = 'buy' | 'sell' | 'dividend' | 'fee'

export type CostBasisTransaction = {
  type: AssetTransactionType
  qty: string | number | null
  priceMinor: string | number | bigint | null
  feesMinor: string | number | bigint | null
  datetime: string | Date
}

export type CostBasisResult = {
  /** Quantity currently held (0 if fully sold or no buys yet). */
  qty: number
  /** Remaining cost basis (bigint minor units) for the held quantity. */
  totalCostMinor: bigint
  /** Average cost per whole unit (bigint minor units), or null if qty is 0. */
  avgCostMinor: bigint | null
  /** Cumulative realized P&L (bigint minor units) from sells to date. */
  realizedPnlMinor: bigint
  /** Cumulative dividends received (bigint minor units). */
  dividendsMinor: bigint
  /** Cumulative fee-only transactions (bigint minor units, not already netted into buy/sell). */
  feesMinor: bigint
}

function toNumberQty(qty: string | number | null): number {
  if (qty === null) return 0
  const n = typeof qty === 'number' ? qty : parseFloat(qty)
  return Number.isFinite(n) ? n : 0
}

/**
 * Fold a holding's transactions (any order) into its current qty + cost basis.
 * Pure function — same input list ⇒ same output, regardless of array order (sorts
 * internally by datetime).
 */
export function computeCostBasis(transactions: CostBasisTransaction[]): CostBasisResult {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
  )

  let qty = 0
  let totalCost = 0n
  let realizedPnl = 0n
  let dividends = 0n
  let fees = 0n

  for (const tx of sorted) {
    const price = parseMinor(tx.priceMinor)
    const txFees = parseMinor(tx.feesMinor)

    if (tx.type === 'buy') {
      const q = toNumberQty(tx.qty)
      if (q <= 0) continue
      const cost = BigInt(Math.round(q * Number(price))) + txFees
      qty += q
      totalCost += cost
    } else if (tx.type === 'sell') {
      const q = toNumberQty(tx.qty)
      if (q <= 0 || qty <= 0) continue
      // Weighted-average-cost method: remove a proportional share of the
      // remaining cost basis, never more than what's actually held.
      const sellQty = Math.min(q, qty)
      const avgCostPerUnit = Number(totalCost) / qty
      const costRemoved = BigInt(Math.round(avgCostPerUnit * sellQty))
      const proceeds = BigInt(Math.round(sellQty * Number(price))) - txFees
      realizedPnl += proceeds - costRemoved
      totalCost -= costRemoved
      qty -= sellQty
    } else if (tx.type === 'dividend') {
      dividends += price // dividend total amount lives in price_minor (qty is null)
    } else if (tx.type === 'fee') {
      fees += price + txFees
    }
  }

  // Guard against float drift leaving a residual cost basis on a fully-sold position.
  if (qty <= 1e-9) {
    qty = 0
    totalCost = 0n
  }

  const avgCostMinor = qty > 0 ? BigInt(Math.round(Number(totalCost) / qty)) : null

  return {
    qty,
    totalCostMinor: totalCost,
    avgCostMinor,
    realizedPnlMinor: realizedPnl,
    dividendsMinor: dividends,
    feesMinor: fees,
  }
}
