// M6-1 (pm-desk review 2026-07-03): pin the trip settlement math.
// Money is integer satang; the rounding remainder of an equal split lands on
// the PAYER by construction (payer keeps their own share and never owes
// themselves) — these tests make that policy explicit and regression-proof.
import { describe, it, expect } from 'vitest'
import {
  perHead,
  computeTripLedger,
  computeTripDebts,
  type Participant,
  type Expense,
  type Slip,
} from '@/lib/trip'

const A: Participant = { id: 'pa', nickname: 'A (owner)', is_owner: true }
const B: Participant = { id: 'pb', nickname: 'B', is_owner: false }
const C: Participant = { id: 'pc', nickname: 'C', is_owner: false }
const TRIO = [A, B, C]

function expense(over: Partial<Expense> & Pick<Expense, 'total_amount_satang' | 'split_among'>): Expense {
  return {
    id: over.id ?? 'e1',
    payer_participant_id: over.payer_participant_id ?? A.id,
    title: over.title ?? 'dinner',
    total_amount_satang: over.total_amount_satang,
    split_among: over.split_among,
  }
}

function slip(over: Partial<Slip> & Pick<Slip, 'amount_satang'>): Slip {
  return {
    id: over.id ?? 's1',
    expense_id: over.expense_id ?? 'e1',
    payer_participant_id: over.payer_participant_id === undefined ? B.id : over.payer_participant_id,
    amount_satang: over.amount_satang,
    confirmed: over.confirmed ?? true,
  }
}

describe('perHead', () => {
  it('splits an exact division evenly', () => {
    // ฿900.00 among 3 → ฿300.00 each (the TRIP-3 E2E case, in satang)
    expect(perHead({ total_amount_satang: 90000, split_among: 3 })).toBe(30000)
  })

  it('rounds a non-divisible total (1000/3 → 333)', () => {
    expect(perHead({ total_amount_satang: 1000, split_among: 3 })).toBe(333)
  })

  it('rounds up when the fraction is above half (100/6 → 17)', () => {
    expect(perHead({ total_amount_satang: 100, split_among: 6 })).toBe(17)
  })

  it('keeps the total deviation within half a satang per head (payer absorbs it)', () => {
    const samples: Array<[number, number]> = [
      [1000, 3],
      [100, 6],
      [99999, 7],
      [1, 2],
      [123457, 9],
      [90000, 3],
    ]
    for (const [total, n] of samples) {
      const deviation = Math.abs(perHead({ total_amount_satang: total, split_among: n }) * n - total)
      expect(deviation, `total=${total} n=${n}`).toBeLessThanOrEqual(n / 2)
    }
  })
})

describe('computeTripLedger — shares', () => {
  it('charges every non-payer one share and credits the payer the sum', () => {
    const ledger = computeTripLedger(TRIO, [expense({ total_amount_satang: 90000, split_among: 3 })], [])
    expect(ledger.get(A.id)).toEqual({ owes: 0, paid: 0, owedToThem: 60000 })
    expect(ledger.get(B.id)).toEqual({ owes: 30000, paid: 0, owedToThem: 0 })
    expect(ledger.get(C.id)).toEqual({ owes: 30000, paid: 0, owedToThem: 0 })
  })

  it('is symmetric per expense: Σ others\' owes === payer owedToThem', () => {
    const ledger = computeTripLedger(TRIO, [expense({ total_amount_satang: 1000, split_among: 3 })], [])
    const othersOwe = ledger.get(B.id)!.owes + ledger.get(C.id)!.owes
    expect(othersOwe).toBe(ledger.get(A.id)!.owedToThem)
  })

  it('pins payer-absorbs-remainder on a non-divisible total (1000/3: payer is owed 666, not 667)', () => {
    const ledger = computeTripLedger(TRIO, [expense({ total_amount_satang: 1000, split_among: 3 })], [])
    expect(ledger.get(B.id)!.owes).toBe(333)
    expect(ledger.get(C.id)!.owes).toBe(333)
    expect(ledger.get(A.id)!.owedToThem).toBe(666) // remainder (1 satang) stays with the payer
  })

  it('accumulates across expenses with different payers', () => {
    const ledger = computeTripLedger(
      TRIO,
      [
        expense({ id: 'e1', payer_participant_id: A.id, total_amount_satang: 90000, split_among: 3 }),
        expense({ id: 'e2', payer_participant_id: B.id, total_amount_satang: 60000, split_among: 3 }),
      ],
      [],
    )
    expect(ledger.get(A.id)).toEqual({ owes: 20000, paid: 0, owedToThem: 60000 })
    expect(ledger.get(B.id)).toEqual({ owes: 30000, paid: 0, owedToThem: 40000 })
    expect(ledger.get(C.id)).toEqual({ owes: 50000, paid: 0, owedToThem: 0 })
  })
})

describe('computeTripLedger — slips', () => {
  const oneExpense = [expense({ total_amount_satang: 90000, split_among: 3 })]

  it('counts only CONFIRMED slips into paid', () => {
    const ledger = computeTripLedger(TRIO, oneExpense, [
      slip({ id: 's1', payer_participant_id: B.id, amount_satang: 30000, confirmed: true }),
      slip({ id: 's2', payer_participant_id: C.id, amount_satang: 30000, confirmed: false }),
    ])
    expect(ledger.get(B.id)!.paid).toBe(30000)
    expect(ledger.get(C.id)!.paid).toBe(0)
  })

  it('ignores a slip with no payer_participant_id (legacy/unbound row)', () => {
    const ledger = computeTripLedger(TRIO, oneExpense, [
      slip({ payer_participant_id: null, amount_satang: 30000, confirmed: true }),
    ])
    for (const p of TRIO) expect(ledger.get(p.id)!.paid).toBe(0)
  })

  it('ignores a slip from a participant not in the list (no crash, no effect)', () => {
    const ledger = computeTripLedger(TRIO, oneExpense, [
      slip({ payer_participant_id: 'ghost', amount_satang: 30000, confirmed: true }),
    ])
    for (const p of TRIO) expect(ledger.get(p.id)!.paid).toBe(0)
  })

  it('nets multiple confirmed slips per participant', () => {
    const ledger = computeTripLedger(TRIO, oneExpense, [
      slip({ id: 's1', payer_participant_id: B.id, amount_satang: 10000, confirmed: true }),
      slip({ id: 's2', payer_participant_id: B.id, amount_satang: 20000, confirmed: true }),
    ])
    expect(ledger.get(B.id)!.paid).toBe(30000)
  })
})

// J5 (design v3) — "ใครติดใคร เท่าไหร่" is the trip home's focal element.
// computeTripDebts reuses perHead (the same M6 settlement math) and just
// re-aggregates it per debtor→payer pair for direct "X → Y ฿amount" display.
describe('computeTripDebts', () => {
  const oneExpense = [expense({ total_amount_satang: 90000, split_among: 3 })] // A paid, 30000 each

  it('lists each non-payer owing the payer their share', () => {
    const debts = computeTripDebts(TRIO, oneExpense, [])
    expect(debts).toEqual(
      expect.arrayContaining([
        { fromId: B.id, toId: A.id, amountSatang: 30000 },
        { fromId: C.id, toId: A.id, amountSatang: 30000 },
      ]),
    )
    expect(debts).toHaveLength(2)
  })

  it('sorts largest debt first', () => {
    const debts = computeTripDebts(
      TRIO,
      [
        expense({ id: 'e1', payer_participant_id: A.id, total_amount_satang: 90000, split_among: 3 }),
        expense({ id: 'e2', payer_participant_id: B.id, total_amount_satang: 300000, split_among: 3 }),
      ],
      [],
    )
    // A: paid e1 (owed 60000 total from B+C); B: paid e2 (owed 200000 from A+C, but
    // also owes A 30000 from e1) — pairs stay separate (no cross-payer netting).
    expect(debts[0]).toEqual({ fromId: A.id, toId: B.id, amountSatang: 100000 })
  })

  it('reduces a debt by confirmed slips paid toward that specific expense', () => {
    const debts = computeTripDebts(TRIO, oneExpense, [
      slip({ id: 's1', payer_participant_id: B.id, amount_satang: 30000, confirmed: true }),
    ])
    expect(debts).toEqual([{ fromId: C.id, toId: A.id, amountSatang: 30000 }])
  })

  it('ignores unconfirmed slips (still owed in full)', () => {
    const debts = computeTripDebts(TRIO, oneExpense, [
      slip({ id: 's1', payer_participant_id: B.id, amount_satang: 30000, confirmed: false }),
    ])
    expect(debts).toEqual(
      expect.arrayContaining([{ fromId: B.id, toId: A.id, amountSatang: 30000 }]),
    )
  })

  it('omits a fully-settled pair entirely', () => {
    const debts = computeTripDebts(TRIO, oneExpense, [
      slip({ id: 's1', payer_participant_id: B.id, amount_satang: 30000, confirmed: true }),
      slip({ id: 's2', payer_participant_id: C.id, amount_satang: 30000, confirmed: true }),
    ])
    expect(debts).toEqual([])
  })

  it('accumulates the same debtor→payer pair across multiple expenses', () => {
    const debts = computeTripDebts(
      TRIO,
      [
        expense({ id: 'e1', payer_participant_id: A.id, total_amount_satang: 90000, split_among: 3 }),
        expense({ id: 'e2', payer_participant_id: A.id, total_amount_satang: 60000, split_among: 3 }),
      ],
      [],
    )
    expect(debts).toEqual(
      expect.arrayContaining([
        { fromId: B.id, toId: A.id, amountSatang: 50000 },
        { fromId: C.id, toId: A.id, amountSatang: 50000 },
      ]),
    )
  })
})
