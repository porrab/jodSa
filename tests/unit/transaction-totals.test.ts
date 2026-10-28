import { describe, expect, it } from 'vitest'
import { addToIncomeExpensePoint, dayExpenseTotal } from '@/lib/transaction-totals'

const flows = [
  { type: 'income' as const, amount_satang: 100_000 },
  { type: 'expense' as const, amount_satang: 20_000 },
  { type: 'transfer' as const, amount_satang: 5_000 },
  { type: 'invest' as const, amount_satang: 30_000 },
  { type: 'divest' as const, amount_satang: 10_000 },
]

describe('report totals across all transaction types', () => {
  it('counts only expenses in the B3 day total', () => {
    expect(dayExpenseTotal(flows)).toBe(20_000)
  })

  it('counts only income and expense in the budget chart', () => {
    const point = { income: 0, expense: 0 }
    flows.forEach((flow) => addToIncomeExpensePoint(point, flow))
    expect(point).toEqual({ income: 100_000, expense: 20_000 })
  })
})
