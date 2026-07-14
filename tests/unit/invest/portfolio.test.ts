import { describe, it, expect } from 'vitest'
import {
  valueHolding,
  computeTotals,
  computeAllocation,
  aggregateByAsset,
  computeConcentration,
  buildSnapshotPayload,
  DISPLAY_CURRENCY,
  type HoldingInput,
} from '@/lib/invest/portfolio'
import { toMinor, minorToApi } from '@/lib/invest/money'

function buyTx(qty: number, price: number, currency: string, fees = 0, fxRate: number | null = null, datetime = '2026-01-01T00:00:00Z') {
  return {
    type: 'buy' as const,
    qty: String(qty),
    priceMinor: minorToApi(toMinor(price, currency)),
    feesMinor: minorToApi(toMinor(fees, currency)),
    fxRate: fxRate !== null ? String(fxRate) : null,
    datetime,
  }
}

describe('lib/invest/portfolio — hand-computed multi-currency fixture (M3 acceptance)', () => {
  // Same fixture as tests/unit/invest/money.test.ts's M1 fixture: a USD holding
  // (10 AAPL @ $150.00 + $1.00 fee, FX 36.50 at cost) and a THB holding (100 PTT
  // @ ฿35.25 + ฿10.00 fee) coexist, neither priced yet (valued at cost).
  const usdHolding: HoldingInput = {
    holdingId: 'h-usd',
    assetId: 'a-aapl',
    assetClass: 'us_equity',
    currency: 'USD',
    sleeve: 'core',
    currentValueMinor: null,
    currentValueCurrency: null,
    currentFxToDisplay: null,
    transactions: [buyTx(10, 150, 'USD', 1, 36.5)],
  }
  const thbHolding: HoldingInput = {
    holdingId: 'h-thb',
    assetId: 'a-ptt',
    assetClass: 'thai_set',
    currency: 'THB',
    sleeve: 'core',
    currentValueMinor: null,
    currentValueCurrency: null,
    currentFxToDisplay: null,
    transactions: [buyTx(100, 35.25, 'THB', 10)],
  }

  it('converts the USD holding cost basis into THB using the buy transaction fx_rate', () => {
    const v = valueHolding(usdHolding)
    expect(v.costMinor).toBe(5478650n) // matches money.test.ts's convertMinor(150100n, 36.5, USD, THB)
    expect(v.unconverted).toBe(false)
    expect(v.hasCurrentValue).toBe(false)
    expect(v.effectiveMinor).toBe(5478650n) // valued at cost until priced
    expect(v.pnlMinor).toBeNull()
  })

  it('THB holding needs no conversion', () => {
    const v = valueHolding(thbHolding)
    expect(v.costMinor).toBe(353500n)
    expect(v.effectiveMinor).toBe(353500n)
  })

  it('portfolio totals sum both holdings in THB, unpriced -> zero P&L', () => {
    const rows = [usdHolding, thbHolding].map((h) => valueHolding(h))
    const totals = computeTotals(rows)
    expect(totals.totalValueMinor).toBe(5832150n) // 5478650 + 353500
    expect(totals.totalCostMinor).toBe(5832150n)
    expect(totals.totalPnlMinor).toBe(0n)
    expect(totals.unpricedCount).toBe(2)
    expect(totals.excludedCount).toBe(0)
    expect(totals.currency).toBe(DISPLAY_CURRENCY)
  })

  it('allocation by asset class matches the hand-computed percentages', () => {
    const rows = [usdHolding, thbHolding].map((h) => valueHolding(h))
    const buckets = computeAllocation(rows, 'assetClass')
    const usEquity = buckets.find((b) => b.key === 'us_equity')!
    const thaiSet = buckets.find((b) => b.key === 'thai_set')!
    expect(usEquity.valueMinor).toBe(5478650n)
    expect(thaiSet.valueMinor).toBe(353500n)
    // 5478650 / 5832150 = 93.939...%
    expect(usEquity.pct).toBeCloseTo(93.94, 1)
    expect(thaiSet.pct).toBeCloseTo(6.06, 1)
  })

  it('a priced holding computes real P&L against its display-currency cost basis', () => {
    const priced: HoldingInput = {
      ...usdHolding,
      currentValueMinor: minorToApi(toMinor(2000, 'USD')), // $2,000.00
      currentValueCurrency: 'USD',
      currentFxToDisplay: 37.0,
    }
    const v = valueHolding(priced)
    expect(v.hasCurrentValue).toBe(true)
    expect(v.valueMinor).toBe(7400000n) // $2,000 * 37.0 = ฿74,000.00
    expect(v.costMinor).toBe(5478650n)
    expect(v.pnlMinor).toBe(7400000n - 5478650n)
    expect(v.effectiveMinor).toBe(7400000n)
  })
})

describe('lib/invest/portfolio — multi-row-same-asset aggregation (pm-desk M1 forward-risk note)', () => {
  // holdings has no UNIQUE(user_id, asset_id, broker) — the same asset can be
  // split across two holding rows (e.g. bought via two different brokers).
  // Concentration MUST merge them before ranking, or it under-reports risk.
  const aaplRow1: HoldingInput = {
    holdingId: 'h1',
    assetId: 'asset-aapl',
    assetClass: 'us_equity',
    currency: 'USD',
    sleeve: 'core',
    currentValueMinor: null,
    currentValueCurrency: null,
    currentFxToDisplay: null,
    transactions: [buyTx(10, 150, 'USD', 1, 36.5)], // native cost 150100 -> THB 5478650
  }
  const aaplRow2: HoldingInput = {
    holdingId: 'h2',
    assetId: 'asset-aapl', // SAME asset as h1, different holding row (e.g. a different broker)
    assetClass: 'us_equity',
    currency: 'USD',
    sleeve: 'satellite',
    currentValueMinor: null,
    currentValueCurrency: null,
    currentFxToDisplay: null,
    transactions: [buyTx(5, 160, 'USD', 0, 36.5)], // native cost 80000 -> THB 2920000
  }
  const pttRow: HoldingInput = {
    holdingId: 'h3',
    assetId: 'asset-ptt',
    assetClass: 'thai_set',
    currency: 'THB',
    sleeve: 'core',
    currentValueMinor: null,
    currentValueCurrency: null,
    currentFxToDisplay: null,
    // A single PTT position bigger than either AAPL row alone (5,478,650 /
    // 2,920,000) but smaller than the two AAPL rows combined (8,398,650) —
    // the exact case that catches a mis-weighted (un-merged) concentration
    // ranking: 1,000 units @ ฿70.00 = ฿70,000.00 = 7,000,000 minor.
    transactions: [buyTx(1000, 70, 'THB', 0)],
  }

  it('aggregateByAsset merges same-asset holding rows into one position, summing qty + value', () => {
    const rows = [aaplRow1, aaplRow2, pttRow].map((h) => valueHolding(h))
    const positions = aggregateByAsset(rows)
    expect(positions).toHaveLength(2) // AAPL merged into one, PTT is its own
    const aapl = positions.find((p) => p.assetId === 'asset-aapl')!
    expect(aapl.qty).toBe(15) // 10 + 5
    expect(aapl.valueMinor).toBe(5478650n + 2920000n) // 8398650n
    const ptt = positions.find((p) => p.assetId === 'asset-ptt')!
    expect(ptt.valueMinor).toBe(7000000n)
  })

  it('concentration ranks the MERGED AAPL position above PTT, not the raw un-merged rows', () => {
    const rows = [aaplRow1, aaplRow2, pttRow].map((h) => valueHolding(h))
    const concentration = computeConcentration(rows)
    // Un-merged, PTT's single row (7,000,000) would outrank either AAPL row
    // alone (5,478,650 / 2,920,000) — the bug this test guards against. Only
    // the merged AAPL position (8,398,650) correctly outranks PTT.
    expect(concentration.top[0].assetId).toBe('asset-aapl')
    expect(concentration.top[0].valueMinor).toBe(8398650n)
    expect(concentration.top[1].assetId).toBe('asset-ptt')
    expect(concentration.top[1].valueMinor).toBe(7000000n)
    const total = 8398650n + 7000000n
    expect(concentration.top[0].pct).toBeCloseTo(Number((8398650n * 10000n) / total) / 100, 5)
    expect(concentration.top1Pct).toBeCloseTo(concentration.top[0].pct, 5)
  })

  it('sleeve allocation still sums correctly across the two same-asset rows (different sleeves)', () => {
    const rows = [aaplRow1, aaplRow2, pttRow].map((h) => valueHolding(h))
    const buckets = computeAllocation(rows, 'sleeve')
    const core = buckets.find((b) => b.key === 'core')!
    const satellite = buckets.find((b) => b.key === 'satellite')!
    expect(core.valueMinor).toBe(5478650n + 7000000n) // aaplRow1 (core) + pttRow (core)
    expect(satellite.valueMinor).toBe(2920000n) // aaplRow2 (satellite)
  })
})

describe('lib/invest/portfolio — unconverted FX handling', () => {
  it('a non-display-currency holding with no fx_rate on any buy is excluded from totals, not assumed 1:1', () => {
    const noFx: HoldingInput = {
      holdingId: 'h-nofx',
      assetId: 'asset-nofx',
      assetClass: 'crypto',
      currency: 'USD',
      sleeve: 'risk_capital',
      currentValueMinor: null,
      currentValueCurrency: null,
      currentFxToDisplay: null,
      transactions: [buyTx(1, 60000, 'USD', 0, null)], // no fxRate captured
    }
    const v = valueHolding(noFx)
    expect(v.unconverted).toBe(true)
    expect(v.effectiveMinor).toBeNull()

    const totals = computeTotals([v])
    expect(totals.excludedCount).toBe(1)
    expect(totals.totalValueMinor).toBe(0n)

    const buckets = computeAllocation([v], 'assetClass')
    expect(buckets).toHaveLength(0) // excluded, not silently bucketed at a wrong value
  })

  it('a current value in a foreign currency with no current_fx_to_display is unconverted, not the cost basis', () => {
    const missingValueFx: HoldingInput = {
      holdingId: 'h-mv',
      assetId: 'asset-mv',
      assetClass: 'us_equity',
      currency: 'USD',
      sleeve: 'core',
      currentValueMinor: minorToApi(toMinor(1000, 'USD')),
      currentValueCurrency: 'USD',
      currentFxToDisplay: null, // missing — should NOT silently assume 1:1
      transactions: [buyTx(1, 900, 'USD', 0, 36.5)],
    }
    const v = valueHolding(missingValueFx)
    expect(v.unconverted).toBe(true)
    expect(v.hasCurrentValue).toBe(true)
    expect(v.valueMinor).toBeNull()
    expect(v.pnlMinor).toBeNull()
  })
})

describe('lib/invest/portfolio — snapshot serialization (portfolio_snapshots jsonb round-trip)', () => {
  it('buildSnapshotPayload produces JSON-safe (string, not bigint) money fields', () => {
    const usdHolding: HoldingInput = {
      holdingId: 'h-usd',
      assetId: 'a-aapl',
      assetClass: 'us_equity',
      currency: 'USD',
      sleeve: 'core',
      currentValueMinor: null,
      currentValueCurrency: null,
      currentFxToDisplay: null,
      transactions: [buyTx(10, 150, 'USD', 1, 36.5)],
    }
    const rows = [usdHolding].map((h) => valueHolding(h))
    const payload = buildSnapshotPayload(rows)

    // Round-trips through JSON.stringify/parse exactly as it would through
    // a real supabase-js insert + a later select — no bigint anywhere.
    const roundTripped = JSON.parse(JSON.stringify(payload))
    expect(roundTripped.totals.valueMinor).toBe('5478650')
    expect(roundTripped.totals.costMinor).toBe('5478650')
    expect(roundTripped.totals.pnlMinor).toBe('0')
    expect(roundTripped.displayCurrency).toBe('THB')
    expect(roundTripped.holdings[0].costMinor).toBe('5478650')
    expect(typeof roundTripped.holdings[0].costMinor).toBe('string')
  })

  it('a reloaded snapshot displays the exact totals it was saved with (no recompute drift)', () => {
    const rows: HoldingInput[] = [
      {
        holdingId: 'h1',
        assetId: 'a1',
        assetClass: 'gold',
        currency: 'THB',
        sleeve: 'core',
        currentValueMinor: minorToApi(toMinor(50000, 'THB')),
        currentValueCurrency: 'THB',
        currentFxToDisplay: null,
        transactions: [buyTx(1, 45000, 'THB', 0)],
      },
    ]
    const valued = rows.map((h) => valueHolding(h))
    const savedAt = buildSnapshotPayload(valued)
    const reloaded = JSON.parse(JSON.stringify(savedAt)) // simulates a DB round-trip
    expect(reloaded.totals.valueMinor).toBe(savedAt.totals.valueMinor)
    expect(reloaded.totals.pnlMinor).toBe(savedAt.totals.pnlMinor)
    expect(reloaded.allocation.assetClass).toEqual(savedAt.allocation.assetClass)
  })
})
