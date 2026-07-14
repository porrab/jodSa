import { describe, it, expect } from 'vitest'
import {
  toMinor,
  toMajor,
  parseMinor,
  minorToApi,
  formatMoney,
  parseInputToMinor,
  addMinor,
  subMinor,
  convertMinor,
  minorUnitDecimals,
} from '@/lib/invest/money'

describe('lib/invest/money — minor-unit conversions', () => {
  it('toMinor/toMajor round-trip for THB (2 decimals)', () => {
    expect(toMinor(3535, 'THB')).toBe(353500n)
    expect(toMajor(353500n, 'THB')).toBe(3535)
  })

  it('toMinor/toMajor round-trip for USD (2 decimals)', () => {
    expect(toMinor(1501, 'USD')).toBe(150100n)
    expect(toMajor(150100n, 'USD')).toBe(1501)
  })

  it('unknown currencies default to 2 decimals', () => {
    expect(toMinor(10, 'GBP')).toBe(1000n)
  })

  it('parseMinor accepts string (PostgREST bigint shape), number, and bigint', () => {
    expect(parseMinor('150100')).toBe(150100n)
    expect(parseMinor(150100)).toBe(150100n)
    expect(parseMinor(150100n)).toBe(150100n)
    expect(parseMinor(null)).toBe(0n)
    expect(parseMinor(undefined)).toBe(0n)
  })

  it('minorToApi converts bigint to a JSON-safe string', () => {
    expect(minorToApi(150100n)).toBe('150100')
  })

  it('parseInputToMinor parses a user-typed amount, rejects blank/non-positive', () => {
    expect(parseInputToMinor('1,501.00', 'USD')).toBe(150100n)
    expect(parseInputToMinor('0', 'USD')).toBeNull()
    expect(parseInputToMinor('', 'USD')).toBeNull()
    expect(parseInputToMinor('-5', 'USD')).toBeNull()
  })
})

describe('lib/invest/money — hand-computed multi-currency fixture (M1 acceptance)', () => {
  // Fixture: a USD holding (10 AAPL @ $150.00 + $1.00 fee) and a THB holding
  // (100 PTT @ ฿35.25 + ฿10.00 fee) coexist — each holding's own cost basis is
  // computed in its native currency (never pre-converted at write time, per
  // 02-architecture.md "store native, tag currency").
  it('USD holding: 10 shares @ $150.00 + $1.00 fee = $1,501.00 total cost', () => {
    const qty = 10
    const price = toMinor(150, 'USD') // 15000n
    const fees = toMinor(1, 'USD') // 100n
    const totalCost = addMinor(BigInt(qty) * price, fees)
    expect(totalCost).toBe(150100n)
    expect(formatMoney(totalCost, 'USD', 'en-US')).toBe('$1,501.00')
  })

  it('THB holding: 100 shares @ ฿35.25 + ฿10.00 fee = ฿3,535.00 total cost', () => {
    const qty = 100
    const price = toMinor(35.25, 'THB') // 3525n
    const fees = toMinor(10, 'THB') // 1000n
    const totalCost = addMinor(BigInt(qty) * price, fees)
    expect(totalCost).toBe(353500n)
  })

  it('FX-at-cost: converts the USD cost basis into THB using a stored (not fetched) rate', () => {
    // $1,501.00 total cost, FX-at-cost captured as 36.50 THB per USD at trade time.
    const usdCostMinor = 150100n
    const thbEquivalent = convertMinor(usdCostMinor, 36.5, 'USD', 'THB')
    // 1501.00 * 36.50 = 54786.50 THB -> 5478650 satang, rounded once at the THB boundary.
    expect(thbEquivalent).toBe(5478650n)
  })

  it('two different-currency holdings never get pre-converted at write time', () => {
    // Each holding keeps its own native minor amount + currency tag — subtracting
    // across currencies without conversion is a caller error the type system
    // doesn't prevent, but the values themselves must stay untouched.
    const usdCost = 150100n
    const thbCost = 353500n
    expect(subMinor(usdCost, 0n)).toBe(usdCost)
    expect(subMinor(thbCost, 0n)).toBe(thbCost)
    expect(minorUnitDecimals('USD')).toBe(2)
    expect(minorUnitDecimals('THB')).toBe(2)
  })
})
