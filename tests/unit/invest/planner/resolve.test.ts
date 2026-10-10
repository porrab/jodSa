import { describe, it, expect } from 'vitest'
import { resolveHoldings, type ResolveInput } from '@/lib/invest/planner/resolve'

function input(overrides: Partial<ResolveInput> = {}): ResolveInput {
  return {
    holdingId: 'h1',
    assetId: 'a1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    assetClass: 'us_equity',
    proxyClass: 'us_tech_growth',
    sleeve: 'core',
    isSystemAsset: true,
    valueMinor: 100000n,
    ...overrides,
  }
}

describe('lib/invest/planner/resolve — M5 acceptance: unclassified holdings block the plan', () => {
  it('resolves every holding when all are classified', () => {
    const result = resolveHoldings([input(), input({ holdingId: 'h2', assetId: 'a2', symbol: 'PTT', proxyClass: 'thai_set' })])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.holdings).toHaveLength(2)
      expect(result.holdings[0].proxyClass).toBe('us_tech_growth')
    }
  })

  it('blocks the plan when any holding lacks a proxy_class — never silently defaults', () => {
    const result = resolveHoldings([input(), input({ holdingId: 'h2', assetId: 'a2', proxyClass: null })])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.unclassified).toHaveLength(1)
      expect(result.unclassified[0].holdingId).toBe('h2')
    }
  })

  it('flags a system-seeded asset as not self-classifiable by the user (isCustomAsset: false)', () => {
    const result = resolveHoldings([input({ proxyClass: null, isSystemAsset: true })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.unclassified[0].isCustomAsset).toBe(false)
  })

  it('flags a user-owned custom asset as classifiable (isCustomAsset: true)', () => {
    const result = resolveHoldings([input({ proxyClass: null, isSystemAsset: false })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.unclassified[0].isCustomAsset).toBe(true)
  })

  it('collects every unclassified holding, not just the first', () => {
    const result = resolveHoldings([
      input({ holdingId: 'h1', proxyClass: null }),
      input({ holdingId: 'h2', proxyClass: null }),
      input({ holdingId: 'h3' }), // classified — should not block or appear in the list
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.unclassified.map((u) => u.holdingId).sort()).toEqual(['h1', 'h2'])
  })
})

import { mapToResolveInputs, type PlannerAssetData, type PlannerHoldingData, type PlannerTransactionData } from '@/lib/invest/planner/resolve'

function testAsset(overrides: Partial<PlannerAssetData> = {}): PlannerAssetData {
  return {
    id: 'a1',
    symbol: 'CUSTOM',
    name: 'Custom Unclassified Asset',
    asset_class: 'us_equity',
    currency: 'USD',
    proxy_class: null, // by default unclassified
    is_system: false,
    ...overrides
  }
}

function testHolding(overrides: Partial<PlannerHoldingData> = {}): PlannerHoldingData {
  return {
    id: 'h1',
    asset_id: 'a1',
    sleeve: 'core',
    current_value_minor: '1000',
    current_value_currency: 'USD',
    current_fx_to_display: '35', // e.g. 35.0
    ...overrides
  }
}

function tx(holding_id: string, qty: number, price: string, type: 'buy' | 'sell' = 'buy', fx = '35'): PlannerTransactionData {
  return {
    holding_id,
    type,
    qty: String(qty),
    price_minor: price,
    fees_minor: '0',
    fx_rate: fx,
    datetime: '2026-01-01T10:00Z',
  }
}

describe('lib/invest/planner/resolve — QA-INVEST-1: mapper behavior', () => {
  it('maps an active classified holding correctly', () => {
    const a = testAsset({ proxy_class: 'us_tech_growth' })
    const h = testHolding()
    const t1 = tx(h.id, 10, '100')

    const out = mapToResolveInputs([h], [a], [t1])
    expect(out).toHaveLength(1)
    expect(out[0].holdingId).toBe(h.id)
    expect(out[0].assetId).toBe(a.id)
    expect(out[0].proxyClass).toBe('us_tech_growth')
    expect(out[0].valueMinor).toBe(35000n) // 1000 val * 35 fx
  })

  it('leaves an active unclassified holding in the pipeline to intentionally block plan generation', () => {
    const a = testAsset({ proxy_class: null }) // explicitly null
    const h = testHolding()
    const t1 = tx(h.id, 10, '100')

    const out = mapToResolveInputs([h], [a], [t1])
    expect(out).toHaveLength(1)
    expect(out[0].proxyClass).toBeNull() // will later fail in resolveHoldings
  })

  it('excludes a fully sold holding (qty=0) entirely, preventing it from blocking the plan', () => {
    const a = testAsset({ proxy_class: null }) // explicitly null (unclassified)
    const h = testHolding()

    // Bought 10, sold 10 -> qty becomes 0
    const out = mapToResolveInputs(
      [h],
      [a],
      [tx(h.id, 10, '100'), tx(h.id, 10, '120', 'sell')]
    )

    // The closed position should be skipped, avoiding a spurious block from `proxyClass === null`
    expect(out).toHaveLength(0)
  })
})
