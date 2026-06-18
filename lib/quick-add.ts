export type TxType = 'income' | 'expense' | 'transfer'

export type QuickAddPrefill = Partial<{
  type: TxType
  amount: string
}>

export const QUICK_ADD_EVENT = 'jodsa:quick-add'

/** Anywhere in the (app) shell — dispatch this to open the global quick-add sheet. */
export function openQuickAdd(prefill?: QuickAddPrefill) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<QuickAddPrefill>(QUICK_ADD_EVENT, { detail: prefill ?? {} }))
}
