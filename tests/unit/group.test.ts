import { describe, it, expect } from 'vitest'
import { groupExpenseTotal, groupExpenseByCategory, UNCATEGORIZED, type GroupMember } from '@/lib/group'

const m = (type: GroupMember['type'], baht: number, category: string | null = null): GroupMember => ({
  type,
  amount_satang: baht * 100,
  category,
})

describe('groupExpenseTotal', () => {
  it('sums expense members', () => {
    expect(groupExpenseTotal([m('expense', 300), m('expense', 200)])).toBe(50_000)
  })

  it('a transfer in the group does NOT count toward the total', () => {
    const members = [m('expense', 300), m('transfer', 1000)]
    expect(groupExpenseTotal(members)).toBe(30_000)
  })

  it('income in the group does NOT count toward the total', () => {
    const members = [m('expense', 300), m('income', 500)]
    expect(groupExpenseTotal(members)).toBe(30_000)
  })

  it('is zero for a group with no expense members', () => {
    expect(groupExpenseTotal([m('transfer', 1000), m('income', 500)])).toBe(0)
    expect(groupExpenseTotal([])).toBe(0)
  })
})

describe('groupExpenseByCategory', () => {
  it('buckets expenses by category, descending, excluding non-expense', () => {
    const members = [
      m('expense', 400, 'food'),
      m('expense', 100, 'food'),
      m('expense', 900, 'transport'),
      m('transfer', 1000, 'transport'), // excluded
      m('expense', 50, null), // null → UNCATEGORIZED sentinel
    ]
    expect(groupExpenseByCategory(members)).toEqual([
      ['transport', 90_000],
      ['food', 50_000],
      [UNCATEGORIZED, 5_000],
    ])
  })
})
