// [M3] Group (trip) totals. A group's "total" is its SPEND, so only type='expense'
// members count. Income assigned to a group (e.g. a refund logged as income) and
// transfers between the user's own accounts are NOT trip costs and are excluded —
// counting them would distort what the trip actually cost.

export type GroupMember = {
  type: 'income' | 'expense' | 'transfer'
  amount_satang: number
  category?: string | null
}

/** Total expense (satang) across group members. Income/transfer members don't count. */
export function groupExpenseTotal(members: GroupMember[]): number {
  return members
    .filter((m) => m.type === 'expense')
    .reduce((sum, m) => sum + m.amount_satang, 0)
}

/** Sentinel bucket for expenses without a category; translate at display (group.uncategorized). */
export const UNCATEGORIZED = '__uncategorized__'

/** Expense total grouped by category, sorted descending by amount. */
export function groupExpenseByCategory(members: GroupMember[]): [string, number][] {
  const byCategory = new Map<string, number>()
  for (const m of members) {
    if (m.type !== 'expense') continue
    const key = m.category ?? UNCATEGORIZED
    byCategory.set(key, (byCategory.get(key) ?? 0) + m.amount_satang)
  }
  return [...byCategory.entries()].sort((a, b) => b[1] - a[1])
}
