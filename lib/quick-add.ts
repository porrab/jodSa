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

/** What `<input type="datetime-local">` will actually accept. */
const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

/**
 * Coerce any datetime we might hold into the ONE format
 * `<input type="datetime-local">` accepts (`YYYY-MM-DDTHH:mm`, local time).
 *
 * This exists because of SPEC5-1: a restore payload was built from a FormData
 * whose `datetime` had already been normalised to a UTC ISO string
 * (`2026-07-20T16:49:00.000Z`). Fed back into the control, that is silently
 * rejected and a **required** field re-renders blank — the exact "failed write
 * costs the user their typed input" outcome design v4 F6 forbids.
 *
 * The caller bug is fixed at its source (the snapshot is taken before
 * normalisation), but every restore value passes through here as well: a
 * prefill that a control cannot display is a whole *class* of defect, and the
 * class is cheaper to close than to re-catch. Returns `undefined` rather than
 * an unusable string — a picker with no value still works; one with a value it
 * cannot parse does not.
 */
export function toDatetimeLocal(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  if (DATETIME_LOCAL_RE.test(value)) return value.slice(0, 16)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  // Local components, deliberately — the control is local-time; using the UTC
  // getters here would reintroduce the same off-by-timezone bug it fixes.
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const QUICK_ADD_EVENT = 'jodsa:quick-add'

/** Anywhere in the (app) shell — dispatch this to open the global quick-add sheet. */
export function openQuickAdd(prefill?: QuickAddPrefill) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<QuickAddPrefill>(QUICK_ADD_EVENT, { detail: prefill ?? {} }))
}
