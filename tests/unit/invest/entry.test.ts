import { expect, it } from 'vitest'
import { feeFromBaht, entryCheck } from '@/lib/invest/entry'
import { computeCostBasis } from '@/lib/invest/cost-basis'

it('converts invented THB fees, rounding only at the asset minor unit', () => {
  expect(feeFromBaht('4.08', '34', 'USD')).toBe(12n)
  expect(feeFromBaht('0.20', '40', 'USD')).toBe(1n)
  expect(feeFromBaht('0.19', '40', 'USD')).toBe(0n)
  expect(feeFromBaht('34', '34', 'JPY')).toBe(1n)
  expect(feeFromBaht('0', '34', 'USD')).toBe(0n)
  expect(feeFromBaht(',', '34', 'USD')).toBeNull()
})
it('refuses missing, zero, negative or invalid FX instead of assuming one', () => {
  for (const fx of ['', '0', '-1', 'oops']) expect(feeFromBaht('4.08', fx, 'USD')).toBeNull()
})
it('matches buy cost basis and its THB approximation', () => {
  const check = entryCheck('buy', '0.5000000', '100', '0.12', 'USD', '34')!
  const cost = computeCostBasis([{ type: 'buy', qty: '0.5000000', priceMinor: '10000', feesMinor: '12', datetime: '2026-01-01' }])
  expect(check.minor).toBe(cost.totalCostMinor)
  expect(check.baht).toBe(170408n)
})
it('matches sell proceeds from the cost-basis helper, including fractional rounding', () => {
  const check = entryCheck('sell', '0.3333333', '100.01', '0.12', 'USD', '')!
  const cost = computeCostBasis([
    { type: 'buy', qty: '0.3333333', priceMinor: '6000', feesMinor: '0', datetime: '2026-01-01' },
    { type: 'sell', qty: '0.3333333', priceMinor: '10001', feesMinor: '12', datetime: '2026-01-02' },
  ])
  expect(check.minor).toBe(cost.realizedPnlMinor + 2000n)
  expect(check.baht).toBeNull()
})
it('does not show a misleading total for incomplete or invalid inputs', () => {
  expect(entryCheck('buy', '', '100', '', 'USD', '34')).toBeNull()
  expect(entryCheck('buy', '1', '100', 'oops', 'USD', '34')).toBeNull()
})
