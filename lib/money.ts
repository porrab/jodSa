const SATANG_PER_BAHT = 100

export function toBaht(satang: number): number {
  return satang / SATANG_PER_BAHT
}

export function toSatang(baht: number): number {
  return Math.round(baht * SATANG_PER_BAHT)
}

export function formatTHB(satang: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toBaht(satang))
}

export function formatTHBCompact(satang: number): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toBaht(satang))
}

/**
 * Parse a user-typed baht string → satang integer.
 * Accepts "1,234.56", "1234.56", "1234". Returns null if invalid / non-positive.
 */
export function parseInputToSatang(input: string): number | null {
  if (!input?.trim()) return null
  const cleaned = input.replace(/฿/g, '').replace(/,/g, '').replace(/\s/g, '').trim()
  const value = parseFloat(cleaned)
  if (isNaN(value) || value <= 0) return null
  return Math.round(value * SATANG_PER_BAHT)
}

export type TxForBalance = {
  type: 'income' | 'expense' | 'transfer'
  amount_satang: number
  account_id: string
  to_account_id: string | null
}

/**
 * Balance = Σ income(into acct) − Σ expense(from acct) − Σ transfer_out(from acct) + Σ transfer_in(into acct)
 */
export function computeAccountBalance(transactions: TxForBalance[], accountId: string): number {
  let balance = 0
  for (const tx of transactions) {
    if (tx.type === 'income' && tx.account_id === accountId) {
      balance += tx.amount_satang
    } else if (tx.type === 'expense' && tx.account_id === accountId) {
      balance -= tx.amount_satang
    } else if (tx.type === 'transfer') {
      if (tx.account_id === accountId) balance -= tx.amount_satang
      if (tx.to_account_id === accountId) balance += tx.amount_satang
    }
  }
  return balance
}
