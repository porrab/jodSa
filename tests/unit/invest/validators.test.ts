import { describe, it, expect } from 'vitest'
import {
  customAssetSchema,
  holdingCreateSchema,
  assetTransactionSchema,
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
})
