import { describe, it, expect } from 'vitest'
import { computeCostBasis, type CostBasisTransaction } from '@/lib/invest/cost-basis'

describe('lib/invest/cost-basis — derivation from asset_transactions', () => {
  it('a single buy sets qty + total cost basis', () => {
    const txs: CostBasisTransaction[] = [
      { type: 'buy', qty: '10', priceMinor: '15000', feesMinor: '100', datetime: '2026-01-01T00:00:00Z' },
    ]
    const result = computeCostBasis(txs)
    expect(result.qty).toBe(10)
    expect(result.totalCostMinor).toBe(150100n) // 10*15000 + 100
    expect(result.avgCostMinor).toBe(15010n) // 150100 / 10
    expect(result.realizedPnlMinor).toBe(0n)
  })

  it('multiple buys average the cost basis (weighted-average-cost method)', () => {
    const txs: CostBasisTransaction[] = [
      { type: 'buy', qty: '10', priceMinor: '10000', feesMinor: '0', datetime: '2026-01-01T00:00:00Z' },
      { type: 'buy', qty: '10', priceMinor: '20000', feesMinor: '0', datetime: '2026-02-01T00:00:00Z' },
    ]
    const result = computeCostBasis(txs)
    expect(result.qty).toBe(20)
    expect(result.totalCostMinor).toBe(300000n) // 10*10000 + 10*20000
    expect(result.avgCostMinor).toBe(15000n) // average of 10000 and 20000
  })

  it('a sell removes a proportional share of cost basis and realizes P&L', () => {
    const txs: CostBasisTransaction[] = [
      { type: 'buy', qty: '10', priceMinor: '10000', feesMinor: '0', datetime: '2026-01-01T00:00:00Z' },
      { type: 'sell', qty: '4', priceMinor: '15000', feesMinor: '0', datetime: '2026-03-01T00:00:00Z' },
    ]
    const result = computeCostBasis(txs)
    // avg cost/unit = 10000; selling 4 units removes 4*10000 = 40000 cost basis
    expect(result.qty).toBe(6)
    expect(result.totalCostMinor).toBe(60000n) // 100000 - 40000
    // proceeds = 4*15000 = 60000; cost removed = 40000 -> realized P&L = 20000
    expect(result.realizedPnlMinor).toBe(20000n)
  })

  it('selling the entire position zeroes out qty and cost basis (no float residue)', () => {
    const txs: CostBasisTransaction[] = [
      { type: 'buy', qty: '5', priceMinor: '10000', feesMinor: '0', datetime: '2026-01-01T00:00:00Z' },
      { type: 'sell', qty: '5', priceMinor: '12000', feesMinor: '0', datetime: '2026-02-01T00:00:00Z' },
    ]
    const result = computeCostBasis(txs)
    expect(result.qty).toBe(0)
    expect(result.totalCostMinor).toBe(0n)
    expect(result.avgCostMinor).toBeNull()
    expect(result.realizedPnlMinor).toBe(10000n) // (5*12000) - (5*10000)
  })

  it('order-independent — sorts by datetime internally regardless of input array order', () => {
    const chronological: CostBasisTransaction[] = [
      { type: 'buy', qty: '10', priceMinor: '10000', feesMinor: '0', datetime: '2026-01-01T00:00:00Z' },
      { type: 'sell', qty: '4', priceMinor: '15000', feesMinor: '0', datetime: '2026-03-01T00:00:00Z' },
    ]
    const reversed = [...chronological].reverse()
    expect(computeCostBasis(reversed)).toEqual(computeCostBasis(chronological))
  })

  it('dividend and fee transactions do not affect qty or cost basis, but accumulate separately', () => {
    const txs: CostBasisTransaction[] = [
      { type: 'buy', qty: '10', priceMinor: '10000', feesMinor: '0', datetime: '2026-01-01T00:00:00Z' },
      { type: 'dividend', qty: null, priceMinor: '500', feesMinor: '0', datetime: '2026-02-01T00:00:00Z' },
      { type: 'fee', qty: null, priceMinor: '0', feesMinor: '50', datetime: '2026-02-15T00:00:00Z' },
    ]
    const result = computeCostBasis(txs)
    expect(result.qty).toBe(10)
    expect(result.totalCostMinor).toBe(100000n)
    expect(result.dividendsMinor).toBe(500n)
    expect(result.feesMinor).toBe(50n)
  })

  it('fractional quantities (crypto) are handled without integer truncation', () => {
    const txs: CostBasisTransaction[] = [
      { type: 'buy', qty: '0.5', priceMinor: '6000000', feesMinor: '100', datetime: '2026-01-01T00:00:00Z' },
    ]
    const result = computeCostBasis(txs)
    expect(result.qty).toBe(0.5)
    expect(result.totalCostMinor).toBe(3000100n) // 0.5 * 6000000 + 100
  })

  it('empty transaction list returns a zeroed, well-formed result', () => {
    const result = computeCostBasis([])
    expect(result.qty).toBe(0)
    expect(result.totalCostMinor).toBe(0n)
    expect(result.avgCostMinor).toBeNull()
    expect(result.realizedPnlMinor).toBe(0n)
  })
})
