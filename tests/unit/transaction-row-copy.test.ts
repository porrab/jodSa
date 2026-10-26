import { describe, expect, it } from 'vitest'
import { resolveTransactionRowCopy } from '@/components/transaction-row-copy'

describe('resolveTransactionRowCopy — brief v6 A3', () => {
  it('uses note as title and keeps non-title category and payee in meta', () => {
    expect(resolveTransactionRowCopy({
      tx: {
        type: 'expense',
        note: 'ข้าวเย็นกับแม่',
        counterparty: 'ร้านสุกี้ตี๋น้อย',
        category: 'food',
      },
    })).toMatchObject({
      textTitle: 'ข้าวเย็นกับแม่',
      showCategory: true,
      showPayee: true,
    })
  })

  it('falls back to payee and does not repeat it in meta', () => {
    expect(resolveTransactionRowCopy({
      tx: {
        type: 'expense',
        note: null,
        counterparty: 'ร้านสุกี้ตี๋น้อย',
        category: 'food',
      },
    })).toMatchObject({
      textTitle: 'ร้านสุกี้ตี๋น้อย',
      showCategory: true,
      showPayee: false,
    })
  })

  it('uses category as title only when note and payee are absent', () => {
    expect(resolveTransactionRowCopy({
      tx: {
        type: 'expense',
        note: null,
        counterparty: null,
        category: 'food',
      },
    })).toMatchObject({
      textTitle: null,
      categoryIsTitle: true,
      showCategory: false,
      showPayee: false,
    })
  })

  it('allows a transfer note to replace the destination title', () => {
    expect(resolveTransactionRowCopy({
      tx: {
        type: 'transfer',
        note: 'เก็บค่าเทอม',
        counterparty: null,
        category: null,
      },
      toAccountName: 'Dime! Save',
    })).toMatchObject({
      textTitle: 'เก็บค่าเทอม',
      showCategory: false,
      showPayee: false,
    })
  })
})
