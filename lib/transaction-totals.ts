type CashFlow = { type: 'income' | 'expense' | 'transfer' | 'invest' | 'divest'; amount_satang: number }

export function dayExpenseTotal(rows: CashFlow[]): number {
  return rows.reduce((total, row) => total + (row.type === 'expense' ? row.amount_satang : 0), 0)
}

export function addToIncomeExpensePoint(
  point: { income: number; expense: number },
  row: CashFlow,
): void {
  if (row.type === 'income') point.income += row.amount_satang
  else if (row.type === 'expense') point.expense += row.amount_satang
}
