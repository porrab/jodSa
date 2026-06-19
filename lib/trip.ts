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
