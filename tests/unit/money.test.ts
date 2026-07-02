import { describe, it, expect } from 'vitest'
import {
  toBaht,
  toSatang,
  formatTHB,
  parseInputToSatang,
  computeAccountBalance,
  type TxForBalance,
} from '@/lib/money'

describe('toBaht / toSatang', () => {
  it('converts satang to baht', () => {
    expect(toBaht(12345)).toBe(123.45)
    expect(toBaht(100)).toBe(1)
    expect(toBaht(0)).toBe(0)
  })

  it('converts baht to satang (rounds)', () => {
    expect(toSatang(123.45)).toBe(12345)
    expect(toSatang(1)).toBe(100)
    expect(toSatang(0.001)).toBe(0) // rounds down
    expect(toSatang(99.999)).toBe(10000) // rounds up
  })

  it('round-trips correctly', () => {
    expect(toSatang(toBaht(9950))).toBe(9950)
  })
})

describe('parseInputToSatang', () => {
  it('parses plain number', () => expect(parseInputToSatang('100')).toBe(10000))
  it('parses decimal', () => expect(parseInputToSatang('1234.56')).toBe(123456))
  it('strips commas', () => expect(parseInputToSatang('1,234.56')).toBe(123456))
  it('strips ฿ symbol', () => expect(parseInputToSatang('฿500')).toBe(50000))
  it('returns null for empty', () => expect(parseInputToSatang('')).toBeNull())
  it('returns null for zero', () => expect(parseInputToSatang('0')).toBeNull())
  it('returns null for negative', () => expect(parseInputToSatang('-100')).toBeNull())
  it('returns null for text', () => expect(parseInputToSatang('abc')).toBeNull())
})

describe('computeAccountBalance', () => {
  const A = 'acct-a'
  const B = 'acct-b'

  const txs: TxForBalance[] = [
    { type: 'income',   amount_satang: 100000, account_id: A, to_account_id: null }, // +1000 to A
    { type: 'expense',  amount_satang:  30000, account_id: A, to_account_id: null }, // -300 from A
    { type: 'transfer', amount_satang:  20000, account_id: A, to_account_id: B },    // -200 from A, +200 to B
    { type: 'expense',  amount_satang:  10000, account_id: B, to_account_id: null }, // -100 from B (irrelevant to A)
  ]

  it('balance A = income − expense − transfer_out = 1000 − 300 − 200 = 500 THB', () => {
    expect(computeAccountBalance(txs, A)).toBe(50000) // 500 THB in satang
  })

  it('balance B = transfer_in − expense = 200 − 100 = 100 THB', () => {
    expect(computeAccountBalance(txs, B)).toBe(10000) // 100 THB in satang
  })

  it('transfer is NOT counted in income/expense totals for A', () => {
    const incomeOnly = txs.filter((t) => t.type === 'income')
    expect(computeAccountBalance(incomeOnly, A)).toBe(100000)
  })

  it('returns 0 for an account with no transactions', () => {
    expect(computeAccountBalance(txs, 'acct-c')).toBe(0)
  })

  it('hand fixture: budget check — transfer excluded', () => {
    // 10000 baht income + 7000 baht expense + 5000 baht transfer_out
    // Balance = 10000 − 7000 − 5000 = −2000 (negative, transferred more than remaining)
    // But BUDGET remaining = income − expense_only = 10000 − 7000 = 3000 (verified in M3)
    const fixture: TxForBalance[] = [
      { type: 'income',   amount_satang: 1000000, account_id: A, to_account_id: null },
      { type: 'expense',  amount_satang:  700000, account_id: A, to_account_id: null },
      { type: 'transfer', amount_satang:  500000, account_id: A, to_account_id: B },
    ]
    expect(computeAccountBalance(fixture, A)).toBe(-200000) // -2000 THB
    expect(computeAccountBalance(fixture, B)).toBe(500000)  // +5000 THB
  })

  it('opening balance seeds the running balance (not counted as income)', () => {
    // A opens with 2000 THB; the txs above net +500 THB → 2500 THB total
    expect(computeAccountBalance(txs, A, 200000)).toBe(250000)
    // opening balance alone, no transactions → returned as-is
    expect(computeAccountBalance([], A, 200000)).toBe(200000)
    // omitted opening balance defaults to 0 (backward compatible)
    expect(computeAccountBalance(txs, A)).toBe(50000)
  })
})
