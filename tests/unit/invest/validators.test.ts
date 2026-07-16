import { describe, it, expect } from 'vitest'
import {
  customAssetSchema,
  holdingCreateSchema,
  assetTransactionSchema,
  targetAllocationSchema,
  classifyProxyClassSchema,
  generatePlanSchema,
} from '@/lib/validators/invest'

describe('lib/validators/invest', () => {
  it('customAssetSchema accepts a valid custom asset and uppercases currency', () => {
    const parsed = customAssetSchema.safeParse({
      name: 'My Private Fund',
      assetClass: 'thai_fund',
      currency: 'thb',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.currency).toBe('THB')
  })

  it('customAssetSchema rejects a bad currency code', () => {
    const parsed = customAssetSchema.safeParse({
      name: 'X',
      assetClass: 'gold',
      currency: 'TH',
    })
    expect(parsed.success).toBe(false)
  })

  it('holdingCreateSchema requires a positive qty', () => {
    const parsed = holdingCreateSchema.safeParse({
      assetId: '11111111-1111-1111-1111-111111111111',
      sleeve: 'core',
      qty: 0,
      price: 100,
      currency: 'USD',
      fees: 0,
      datetime: '2026-01-01T00:00',
    })
    expect(parsed.success).toBe(false)
  })

  it('assetTransactionSchema requires qty for buy/sell but not dividend/fee', () => {
    const buyMissingQty = assetTransactionSchema.safeParse({
      holdingId: '11111111-1111-1111-1111-111111111111',
      type: 'buy',
      amount: 100,
      currency: 'USD',
      fees: 0,
      datetime: '2026-01-01T00:00',
    })
    expect(buyMissingQty.success).toBe(false)

    const dividend = assetTransactionSchema.safeParse({
      holdingId: '11111111-1111-1111-1111-111111111111',
      type: 'dividend',
      amount: 500,
      currency: 'USD',
      fees: 0,
      datetime: '2026-01-01T00:00',
    })
    expect(dividend.success).toBe(true)
  })

  // ── M5 — planner input schemas ─────────────────────────────────────────

  it('targetAllocationSchema accepts a set of percentages summing to 100', () => {
    const parsed = targetAllocationSchema.safeParse({
      us_equity: 20, etf: 15, thai_set: 15, thai_fund: 10, gold: 20, crypto: 20,
    })
    expect(parsed.success).toBe(true)
  })

  it('targetAllocationSchema rejects percentages that do not sum to ~100', () => {
    const parsed = targetAllocationSchema.safeParse({ us_equity: 50, gold: 20 })
    expect(parsed.success).toBe(false)
  })

  it('targetAllocationSchema tolerates small rounding error (±0.5)', () => {
    const parsed = targetAllocationSchema.safeParse({ us_equity: 50.3, gold: 49.9 })
    expect(parsed.success).toBe(true)
  })

  it('classifyProxyClassSchema only accepts a known proxy_class key', () => {
    const ok = classifyProxyClassSchema.safeParse({
      assetId: '11111111-1111-1111-1111-111111111111',
      proxyClass: 'us_large_cap',
    })
    expect(ok.success).toBe(true)

    const bad = classifyProxyClassSchema.safeParse({
      assetId: '11111111-1111-1111-1111-111111111111',
      proxyClass: 'made_up_class',
    })
    expect(bad.success).toBe(false)
  })

  it('generatePlanSchema requires a valid target allocation + nonnegative new money', () => {
    const ok = generatePlanSchema.safeParse({
      targetAllocation: { us_equity: 100 },
      newMoney: 3000,
      newMoneyCurrency: 'THB',
    })
    expect(ok.success).toBe(true)

    const negative = generatePlanSchema.safeParse({
      targetAllocation: { us_equity: 100 },
      newMoney: -1,
      newMoneyCurrency: 'THB',
    })
    expect(negative.success).toBe(false)
  })
})
