export type CashLink = {
  id: string
  assetTransactionId: string
  accountName: string
  amountSatang: number
  datetime: string
}

export function cashLinksForBuy(cashLinks: CashLink[], buyId: string): CashLink[] {
  return cashLinks.filter((cash) => cash.assetTransactionId === buyId)
}
