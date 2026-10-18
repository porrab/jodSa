import { describe, it, expect } from 'vitest'
import {
  valueHolding,
  computeTotals,
  computeAllocation,
  aggregateByAsset,
  computeConcentration,
  buildSnapshotPayload,
  getHoldingDisplay,
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

// QA-INVEST-1: a fully-sold holding (qty=0 after sell transactions) must contribute
// zero market value, zero cost, and zero concentration weight — even when the DB row
// still has a stale current_value_minor set — and a missing FX rate on a closed
// position must never block plan generation.
function sellTx(qty: number, price: number, currency: string, fees = 0, fxRate: number | null = null, datetime = '2026-06-01T00:00:00Z') {
  return {
    type: 'sell' as const,
    qty: String(qty),
    priceMinor: minorToApi(toMinor(price, currency)),
    feesMinor: minorToApi(toMinor(fees, currency)),
    fxRate: fxRate !== null ? String(fxRate) : null,
    datetime,
  }
}

describe('lib/invest/portfolio — QA-INVEST-1: fully-sold holding zeroing', () => {
  // THB holding: bought 100 PTT @ ฿35 = ฿3,500 cost; sold all 100; stale current_value_minor = ฿4,000
  const fullySoldTHB: HoldingInput = {
    holdingId: 'h-sold-thb',
    assetId: 'a-ptt',
    assetClass: 'thai_set',
    currency: 'THB',
    sleeve: 'core',
    currentValueMinor: minorToApi(toMinor(4000, 'THB')), // stale — position is closed
    currentValueCurrency: 'THB',
    currentFxToDisplay: null,
    transactions: [
      buyTx(100, 35, 'THB', 0, null, '2026-01-01T00:00:00Z'),
      sellTx(100, 40, 'THB', 0, null, '2026-06-01T00:00:00Z'),
    ],
  }

  // USD holding fully sold, no FX rate anywhere — the case that blocked planning
  const fullySoldUSDNoFx: HoldingInput = {
    holdingId: 'h-sold-usd',
    assetId: 'a-aapl',
    assetClass: 'us_equity',
    currency: 'USD',
    sleeve: 'core',
    currentValueMinor: minorToApi(toMinor(1500, 'USD')), // stale
    currentValueCurrency: 'USD',
    currentFxToDisplay: null,
    transactions: [
      buyTx(10, 150, 'USD', 0, null, '2026-01-01T00:00:00Z'), // no fxRate
      sellTx(10, 160, 'USD', 0, null, '2026-06-01T00:00:00Z'),
    ],
  }

  // Partial sale — still has units; existing behaviour must be preserved
  const partiallySold: HoldingInput = {
    holdingId: 'h-partial',
    assetId: 'a-voo',
    assetClass: 'etf',
    currency: 'THB',
    sleeve: 'core',
    currentValueMinor: minorToApi(toMinor(6000, 'THB')),
    currentValueCurrency: 'THB',
    currentFxToDisplay: null,
    transactions: [
      buyTx(10, 800, 'THB', 0, null, '2026-01-01T00:00:00Z'), // cost ฿8,000
      sellTx(3, 900, 'THB', 0, null, '2026-06-01T00:00:00Z'), // 7 remaining
    ],
  }

  it('fully-sold THB holding: all money fields are zero, unconverted=false', () => {
    const v = valueHolding(fullySoldTHB)
    expect(v.qty).toBe(0)
    expect(v.costMinor).toBe(0n)
    expect(v.valueMinor).toBe(0n)
    expect(v.pnlMinor).toBe(0n)
    expect(v.effectiveMinor).toBe(0n)
    expect(v.unconverted).toBe(false)
  })

  it('fully-sold USD holding with no FX: unconverted=false (does not block planning)', () => {
    const v = valueHolding(fullySoldUSDNoFx)
    expect(v.qty).toBe(0)
    expect(v.unconverted).toBe(false)
    expect(v.effectiveMinor).toBe(0n)
  })

  it('fully-sold holding contributes zero to portfolio totals', () => {
    const valued = [fullySoldTHB, fullySoldUSDNoFx].map((h) => valueHolding(h))
    const totals = computeTotals(valued)
    expect(totals.totalValueMinor).toBe(0n)
    expect(totals.totalCostMinor).toBe(0n)
    expect(totals.excludedCount).toBe(0) // not excluded — just zero
  })

  it('fully-sold holding is strictly filtered out and absent from concentration ranking, including fractional sales', () => {
    const activeTHB: HoldingInput = {
      holdingId: 'h-active',
      assetId: 'a-gold',
      assetClass: 'gold',
      currency: 'THB',
      sleeve: 'core',
      currentValueMinor: minorToApi(toMinor(10000, 'THB')),
      currentValueCurrency: 'THB',
      currentFxToDisplay: null,
      transactions: [buyTx(1, 10000, 'THB', 0)],
    }

    // Add fractional full-sale coverage matching 0.0140444 units
    const fractionalSoldTHB: HoldingInput = {
      holdingId: 'h-sold-frac',
      assetId: 'a-crypto',
      assetClass: 'crypto',
      currency: 'THB',
      sleeve: 'core',
      currentValueMinor: minorToApi(toMinor(500, 'THB')), // Stale snapshot
      currentValueCurrency: 'THB',
      currentFxToDisplay: null,
      transactions: [
        buyTx(0.0140444, 50000, 'THB', 0, null, '2026-01-01T00:00:00Z'),
        sellTx(0.0140444, 60000, 'THB', 0, null, '2026-06-01T00:00:00Z'),
      ],
    }

    const valued = [fullySoldTHB, activeTHB, fractionalSoldTHB].map((h) => valueHolding(h))
    const concentration = computeConcentration(valued)

    // Only the active gold holding should appear; fully-sold and fractionally-sold at zero must be removed entirely
    expect(concentration.top).toHaveLength(1)
    expect(concentration.top[0].assetId).toBe('a-gold')
    expect(concentration.top[0].valueMinor).toBe(toMinor(10000, 'THB'))
  })

  it('partial sale: qty>0 path unchanged — valueMinor reflects stored current value', () => {
    const v = valueHolding(partiallySold)
    expect(v.qty).toBeCloseTo(7, 9)
    expect(v.hasCurrentValue).toBe(true)
    expect(v.valueMinor).toBe(toMinor(6000, 'THB'))
    expect(v.effectiveMinor).toBe(toMinor(6000, 'THB'))
    expect(v.unconverted).toBe(false)
  })
})

describe('lib/invest/portfolio — QA-INVEST-1: getHoldingDisplay UI seam', () => {
  it('zero-qty holding forces zeroes for valueMinor, costMinor, and pnlMinor regardless of stale DB values', () => {
    const h = {
      current_value_minor: '50000', // Stale
      current_value_currency: 'THB',
      costBasis: { qty: 0, totalCostMinor: '100000' } // Stale cost
    }
    const d = getHoldingDisplay(h, 'THB')
    expect(d.valueMinor).toBe('0')
    expect(d.costMinor).toBe('0')
    expect(d.pnlMinor).toBe(0n)
  })

  it('active holding passes through real values and computes pnl if currencies match', () => {
    const h = {
      current_value_minor: '150000',
      current_value_currency: 'USD',
      costBasis: { qty: 10, totalCostMinor: '100000' }
    }
    const d = getHoldingDisplay(h, 'USD')
    expect(d.valueMinor).toBe('150000')
    expect(d.costMinor).toBe('100000')
    expect(d.pnlMinor).toBe(50000n)
  })

  it('null P&L if value currency differs from asset base', () => {
    const h = {
      current_value_minor: '150000',
      current_value_currency: 'THB',
      costBasis: { qty: 10, totalCostMinor: '100000' }
    }
    const d = getHoldingDisplay(h, 'USD')
    expect(d.pnlMinor).toBeNull()
  })
})

describe('lib/invest/portfolio — SPEC-6: ballast sleeve allocation & snapshot', () => {
  it('synthetic 600/200/100/100 holdings yield four buckets: 60%, 20%, 10%, 10%', () => {
    const holdings: HoldingInput[] = [
      {
        holdingId: 'h-core', assetId: 'a1', assetClass: 'us_equity', currency: 'THB',
        sleeve: 'core', currentValueMinor: null, currentValueCurrency: null, currentFxToDisplay: null,
        transactions: [buyTx(1, 600, 'THB', 0)],
      },
      {
        holdingId: 'h-ballast', assetId: 'a2', assetClass: 'gold', currency: 'THB',
        sleeve: 'ballast', currentValueMinor: null, currentValueCurrency: null, currentFxToDisplay: null,
        transactions: [buyTx(1, 200, 'THB', 0)],
      },
      {
        holdingId: 'h-satellite', assetId: 'a3', assetClass: 'crypto', currency: 'THB',
        sleeve: 'satellite', currentValueMinor: null, currentValueCurrency: null, currentFxToDisplay: null,
        transactions: [buyTx(1, 100, 'THB', 0)],
      },
      {
        holdingId: 'h-risk', assetId: 'a4', assetClass: 'etf', currency: 'THB',
        sleeve: 'risk_capital', currentValueMinor: null, currentValueCurrency: null, currentFxToDisplay: null,
        transactions: [buyTx(1, 100, 'THB', 0)],
      },
    ]

    const valued = holdings.map((h) => valueHolding(h))
    const buckets = computeAllocation(valued, 'sleeve')

    expect(buckets).toHaveLength(4)
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b.pct]))
    expect(byKey.core).toBe(60)
    expect(byKey.ballast).toBe(20)
    expect(byKey.satellite).toBe(10)
    expect(byKey.risk_capital).toBe(10)
  })

  it('same asset in core + ballast stays split in sleeve allocation but merges in concentration', () => {
    // e.g. Gold held in two different sleeves: 300 in core, 200 in ballast
    const holdings: HoldingInput[] = [
      {
        holdingId: 'h-gold-core', assetId: 'a-gold', assetClass: 'gold', currency: 'THB',
        sleeve: 'core', currentValueMinor: null, currentValueCurrency: null, currentFxToDisplay: null,
        transactions: [buyTx(1, 300, 'THB', 0)],
      },
      {
        holdingId: 'h-gold-ballast', assetId: 'a-gold', assetClass: 'gold', currency: 'THB',
        sleeve: 'ballast', currentValueMinor: null, currentValueCurrency: null, currentFxToDisplay: null,
        transactions: [buyTx(1, 200, 'THB', 0)],
      },
      {
        holdingId: 'h-other', assetId: 'a-other', assetClass: 'us_equity', currency: 'THB',
        sleeve: 'satellite', currentValueMinor: null, currentValueCurrency: null, currentFxToDisplay: null,
        transactions: [buyTx(1, 500, 'THB', 0)],
      },
    ]

    const valued = holdings.map((h) => valueHolding(h))

    // Sleeve allocation must keep them split across core and ballast
    const sleeveBuckets = computeAllocation(valued, 'sleeve')
    const sleeveMap = Object.fromEntries(sleeveBuckets.map((b) => [b.key, b.pct]))
    expect(sleeveMap.core).toBe(30)
    expect(sleeveMap.ballast).toBe(20)
    expect(sleeveMap.satellite).toBe(50)

    // Asset concentration must merge the same assetId into a single entry
    const concentration = computeConcentration(valued)
    const goldEntry = concentration.top.find((t) => t.assetId === 'a-gold')
    expect(goldEntry).toBeDefined()
    expect(goldEntry?.valueMinor).toBe(toMinor(500, 'THB'))
  })

  it('snapshot JSON payload includes ballast in sleeve allocation', () => {
    const holdings: HoldingInput[] = [
      {
        holdingId: 'h-ballast', assetId: 'a-gold', assetClass: 'gold', currency: 'THB',
        sleeve: 'ballast', currentValueMinor: null, currentValueCurrency: null, currentFxToDisplay: null,
        transactions: [buyTx(1, 5000, 'THB', 0)],
      },
    ]
    const valued = holdings.map((h) => valueHolding(h))
    const snapshot = buildSnapshotPayload(valued)
    const roundTripped = JSON.parse(JSON.stringify(snapshot))

    expect(roundTripped.allocation.sleeve).toEqual([
      { key: 'ballast', valueMinor: '500000', pct: 100 },
    ])
  })

  it('old snapshot without ballast remains a valid render-shape fixture (missing sleeve handled gracefully)', () => {
    // Historical snapshot payload from before sleeve was stored, or three-value snapshot
    const oldSnapshotPayload = {
      displayCurrency: 'THB',
      totals: { valueMinor: '100000', costMinor: '100000', pnlMinor: '0', currency: 'THB' },
      holdings: [],
      allocation: {
        assetClass: [{ key: 'gold', valueMinor: '100000', pct: 100 }],
        currency: [{ key: 'THB', valueMinor: '100000', pct: 100 }],
        // either three-value legacy sleeve or completely absent
        sleeve: [
          { key: 'core', valueMinor: '80000', pct: 80 },
          { key: 'satellite', valueMinor: '20000', pct: 20 },
        ],
      },
    }

    // Verify it parses and can be read as a snapshot
    const parsed = JSON.parse(JSON.stringify(oldSnapshotPayload))
    expect(parsed.allocation.sleeve).toHaveLength(2)
    expect(parsed.allocation.sleeve.some((b: { key: string }) => b.key === 'ballast')).toBe(false)

    // A truly legacy snapshot with no sleeve array at all
    const legacyWithoutSleeve = {
      displayCurrency: 'THB',
      totals: { valueMinor: '100000', costMinor: '100000', pnlMinor: '0', currency: 'THB' },
      holdings: [],
      allocation: {
        assetClass: [{ key: 'gold', valueMinor: '100000', pct: 100 }],
        currency: [{ key: 'THB', valueMinor: '100000', pct: 100 }],
      },
    }
    const legacyParsed = JSON.parse(JSON.stringify(legacyWithoutSleeve))
    const sleeveBuckets = Array.isArray(legacyParsed.allocation?.sleeve) ? legacyParsed.allocation.sleeve : []
    expect(sleeveBuckets).toEqual([])
  })
})
