// Trip-session ledger math. Money is integer satang throughout (lib/money.ts).
//
// Phase-1 split is EQUAL: an expense's per-head share is total / split_among,
// where split_among is a headcount snapshot taken at expense creation (editable).
// The payer keeps their own share and does NOT owe themselves; every OTHER
// participant owes one per-head share. Per-receipt unequal splits are Phase 2.

export type Participant = { id: string; nickname: string; is_owner: boolean }

export type Expense = {
  id: string
  payer_participant_id: string
  title: string
  total_amount_satang: number
  split_among: number
}

export type Slip = {
  id: string
  expense_id: string | null
  payer_participant_id: string | null
  amount_satang: number
  confirmed: boolean
}

export function perHead(expense: Pick<Expense, 'total_amount_satang' | 'split_among'>): number {
  return Math.round(expense.total_amount_satang / expense.split_among)
}

/**
 * Per-participant settlement summary across a whole trip.
 * - `owes`: total per-head shares the participant must pay (expenses they didn't front).
 * - `paid`: confirmed slips they've sent toward those shares.
 * - `owedToThem`: shares others owe on the expenses THIS participant fronted.
 * Returns a map keyed by participant id.
 */
export function computeTripLedger(
  participants: Participant[],
  expenses: Expense[],
  slips: Slip[],
) {
  const summary = new Map<string, { owes: number; paid: number; owedToThem: number }>()
  for (const p of participants) summary.set(p.id, { owes: 0, paid: 0, owedToThem: 0 })

  for (const e of expenses) {
    const share = perHead(e)
    const payer = summary.get(e.payer_participant_id)
    for (const p of participants) {
      if (p.id === e.payer_participant_id) continue
      const s = summary.get(p.id)
      if (s) s.owes += share
      if (payer) payer.owedToThem += share
    }
  }

  for (const slip of slips) {
    if (!slip.confirmed || !slip.payer_participant_id) continue
    const s = summary.get(slip.payer_participant_id)
    if (s) s.paid += slip.amount_satang
  }

  return summary
}

export type TripDebt = { fromId: string; toId: string; amountSatang: number }

/**
 * J5 — "ใครติดใคร เท่าไหร่": the trip home's focal element. Reuses the same
 * per-head math as `computeTripLedger` (perHead), just re-aggregated per
 * debtor→payer pair instead of per participant, so it can render directly as
 * "บอส → ธนภูมิ ฿420" lines. Only the remaining (unpaid-toward-that-expense)
 * amount counts; fully-settled pairs are omitted. Sorted largest first.
 */
export function computeTripDebts(
  participants: Participant[],
  expenses: Expense[],
  slips: Slip[],
): TripDebt[] {
  const debts = new Map<string, number>() // key: `${fromId}>${toId}`

  for (const e of expenses) {
    const share = perHead(e)
    for (const p of participants) {
      if (p.id === e.payer_participant_id) continue
      const paidTowardThis = slips
        .filter((s) => s.confirmed && s.expense_id === e.id && s.payer_participant_id === p.id)
        .reduce((sum, s) => sum + s.amount_satang, 0)
      const remaining = Math.max(0, share - paidTowardThis)
      if (remaining <= 0) continue
      const key = `${p.id}>${e.payer_participant_id}`
      debts.set(key, (debts.get(key) ?? 0) + remaining)
    }
  }

  return [...debts.entries()]
    .map(([key, amountSatang]) => {
      const [fromId, toId] = key.split('>')
      return { fromId, toId, amountSatang }
    })
    .sort((a, b) => b.amountSatang - a.amountSatang)
}
