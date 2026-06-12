import { describe, it, expect } from 'vitest'
import { spentForBudget, budgetStatus, type BudgetRow, type ExpenseRow } from '@/lib/budget'

const NOW = new Date('2026-06-12T05:00:00Z') // 12:00 Bangkok on 2026-06-12

const monthOverall: BudgetRow = {
  id: 'b1', period: 'month', scope: 'overall', category: null, amount_satang: 1_000_000, // 10,000 THB
}

function expense(baht: number, datetime: string, category: string | null = null): ExpenseRow {
  return { amount_satang: baht * 100, category, datetime }
}

describe('budget vs actual (expense only)', () => {
  it('acceptance: budget 10,000 with 7,000 expense → 3,000 remaining', () => {
    // 5,000 "transfer" is excluded upstream (query filters type='expense'), so it
    // simply never appears in the expenses array passed here.
    const expenses = [
      expense(3000, '2026-06-03T10:00:00+07:00'),
      expense(4000, '2026-06-10T10:00:00+07:00'),
    ]
    const status = budgetStatus(monthOverall, expenses, NOW)
    expect(status.spent).toBe(700_000)
    expect(status.remaining).toBe(300_000)
    expect(status.over).toBe(false)
  })

  it('counts only the current Bangkok month', () => {
    const expenses = [
      expense(2000, '2026-06-01T10:00:00+07:00'), // in
      expense(9999, '2026-05-31T23:00:00+07:00'), // previous month, out
      expense(1234, '2026-07-01T00:30:00+07:00'), // next month, out
    ]
    expect(spentForBudget(monthOverall, expenses, NOW)).toBe(200_000)
  })

  it('day-period budget counts only today (Bangkok)', () => {
    const dayBudget: BudgetRow = { ...monthOverall, period: 'day', amount_satang: 50_000 }
    const expenses = [
      expense(300, '2026-06-12T09:00:00+07:00'), // today
      expense(200, '2026-06-11T23:30:00+07:00'), // yesterday, out
    ]
    expect(spentForBudget(dayBudget, expenses, NOW)).toBe(30_000)
  })

  it('category scope counts only that category', () => {
    const foodBudget: BudgetRow = {
      ...monthOverall, scope: 'category', category: 'food', amount_satang: 100_000,
    }
    const expenses = [
      expense(400, '2026-06-05T12:00:00+07:00', 'food'),
      expense(900, '2026-06-06T12:00:00+07:00', 'transport'),
    ]
    expect(spentForBudget(foodBudget, expenses, NOW)).toBe(40_000)
  })

  it('flags over-budget', () => {
    const expenses = [expense(12000, '2026-06-05T12:00:00+07:00')]
    const status = budgetStatus(monthOverall, expenses, NOW)
    expect(status.over).toBe(true)
    expect(status.remaining).toBe(-200_000)
    expect(status.ratio).toBe(1)
  })
})
