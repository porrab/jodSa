import { expect, it } from 'vitest'
import { computeTotals, getHoldingsTotal, valueHolding, type HoldingInput } from '@/lib/invest/portfolio'

const holding = (currency: string, value: string | null, fx: string | null): HoldingInput => ({
  holdingId: currency, assetId: currency, assetClass: 'etf', sleeve: 'core', currency,
  currentValueMinor: value, currentValueCurrency: currency, currentFxToDisplay: fx,
  transactions: [{ type: 'buy', qty: '1', priceMinor: '10000', feesMinor: '0', fxRate: currency === 'USD' ? '35' : null, datetime: '2026-01-01T12:00:00Z' }],
})

it('DS-8 mixed THB and USD holdings use the exact Overview total and FX path', () => {
  const overview = computeTotals([holding('THB', '12345', null), holding('USD', '26796', '35')].map(h => valueHolding(h)))
  expect(overview.totalValueMinor).toBe(950205n)
  expect(getHoldingsTotal(overview)).toBe(overview.totalValueMinor.toString())
})

it('DS-8 all-unpriced holdings use the same cost fallback as Overview', () => {
  const overview = computeTotals([holding('THB', null, null), holding('USD', null, null)].map(h => valueHolding(h)))
  expect(overview.totalValueMinor).toBe(360000n)
  expect(getHoldingsTotal(overview)).toBe('360000')
})

it('DS-8 a recorded zero remains a number and missing FX is excluded by Overview', () => {
  const overview = computeTotals([holding('THB', '0', null), holding('USD', '26796', null)].map(h => valueHolding(h)))
  expect(overview.excludedCount).toBe(1)
  expect(getHoldingsTotal(overview)).toBe('0')
})
