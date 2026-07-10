// M7-A: updateTransaction validation. `transactionUpdateSchema` is the payload
// contract for editing a saved transaction — J3's "everything editable except
// ref_code" is enforced structurally here (the schema has no ref_code field at
// all), not just by the edit form omitting an input for it.
import { describe, it, expect } from 'vitest'
import { transactionUpdateSchema } from '@/lib/validators/transaction'

describe('transactionUpdateSchema', () => {
  it('accepts a valid expense edit', () => {
    const r = transactionUpdateSchema.safeParse({
      type: 'expense',
      amount_satang: 15000,
      account_id: '11111111-1111-1111-1111-111111111111',
      category: 'food',
      counterparty: 'ร้านสุกี้',
      datetime: '2026-07-07T20:31:00+07:00',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a valid income edit', () => {
    const r = transactionUpdateSchema.safeParse({
      type: 'income',
      amount_satang: 500000,
      account_id: '11111111-1111-1111-1111-111111111111',
      datetime: '2026-07-07T09:00:00+07:00',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a valid transfer edit (requires to_account_id)', () => {
    const r = transactionUpdateSchema.safeParse({
      type: 'transfer',
      amount_satang: 200000,
      account_id: '11111111-1111-1111-1111-111111111111',
      to_account_id: '22222222-2222-2222-2222-222222222222',
      datetime: '2026-07-07T09:00:00+07:00',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a transfer missing to_account_id', () => {
    const r = transactionUpdateSchema.safeParse({
      type: 'transfer',
      amount_satang: 200000,
      account_id: '11111111-1111-1111-1111-111111111111',
      datetime: '2026-07-07T09:00:00+07:00',
    })
    expect(r.success).toBe(false)
  })

  it('rejects a non-positive amount', () => {
    const r = transactionUpdateSchema.safeParse({
      type: 'expense',
      amount_satang: 0,
      account_id: '11111111-1111-1111-1111-111111111111',
      datetime: '2026-07-07T20:31:00+07:00',
    })
    expect(r.success).toBe(false)
  })

  it('rejects a missing account_id', () => {
    const r = transactionUpdateSchema.safeParse({
      type: 'expense',
      amount_satang: 15000,
      datetime: '2026-07-07T20:31:00+07:00',
    })
    expect(r.success).toBe(false)
  })

  it('rejects an offset-less datetime', () => {
    const r = transactionUpdateSchema.safeParse({
      type: 'expense',
      amount_satang: 15000,
      account_id: '11111111-1111-1111-1111-111111111111',
      datetime: '2026-07-07T20:31:00',
    })
    expect(r.success).toBe(false)
  })

  it('strips ref_code and bank_code even if present in the raw input — they are not editable (J3)', () => {
    const r = transactionUpdateSchema.safeParse({
      type: 'expense',
      amount_satang: 15000,
      account_id: '11111111-1111-1111-1111-111111111111',
      datetime: '2026-07-07T20:31:00+07:00',
      ref_code: 'attacker-supplied-ref',
      bank_code: 'KTB',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect('ref_code' in r.data).toBe(false)
      expect('bank_code' in r.data).toBe(false)
    }
  })
})
