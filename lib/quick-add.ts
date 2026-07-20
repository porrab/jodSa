export type TxType = 'income' | 'expense' | 'transfer'

/**
 * Every field `TransactionForm` can be seeded with. Widened from `{type, amount}`
 * for design v4 F6: when an optimistic create fails we re-open the sheet with the
 * user's work intact, which means carrying back more than the two fields Home's
 * quick-add card seeds.
 */
export type TxFormValues = Partial<{
  type: TxType
  amount: string
  account_id: string
  to_account_id: string
  category: string
  counterparty: string
  datetime: string
  ref_code: string
  bank_code: string
}>

export type QuickAddPrefill = TxFormValues

export const QUICK_ADD_EVENT = 'jodsa:quick-add'

/** Anywhere in the (app) shell — dispatch this to open the global quick-add sheet. */
export function openQuickAdd(prefill?: QuickAddPrefill) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<QuickAddPrefill>(QUICK_ADD_EVENT, { detail: prefill ?? {} }))
}
