import { describe, expect, it } from 'vitest'
import { cashLinksForBuy, type CashLink } from '@/lib/invest/cash-links'

describe('cash linked to individual buys', () => {
  it('shows the cash line and delete warning for only the funded buy', () => {
    const linkedCash: CashLink[] = [{
      id: 'cash-1', assetTransactionId: 'buy-1', accountName: 'Main',
      amountSatang: 25000, datetime: '2026-10-28T00:00:00Z',
    }]
    expect(cashLinksForBuy(linkedCash, 'buy-1').map((cash) => cash.accountName)).toEqual(['Main'])
    expect(cashLinksForBuy(linkedCash, 'buy-1').length > 0).toBe(true)
    expect(cashLinksForBuy(linkedCash, 'buy-2')).toEqual([])
    expect(cashLinksForBuy(linkedCash, 'buy-2').length > 0).toBe(false)
  })
})
