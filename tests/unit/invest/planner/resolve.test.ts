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
