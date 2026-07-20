/**
 * Optimistic-create orchestration for J1 (design v4 F6), kept as a pure module so
 * the safety-critical contract can be tested without a DOM.
 *
 * The contract, in order of how much it would hurt to get wrong:
 *   1. The provisional row is ALWAYS removed — success or failure, resolved or
 *      thrown. A phantom row in a ledger is worse than a slow save.
 *   2. Failure hands the user's values back so nothing typed is ever lost.
 *   3. Failure is always announced. A write that fails silently is the one
 *      outcome a finance app must never produce.
 */

export type PendingTx = {
  tempId: string
  type: 'income' | 'expense' | 'transfer'
  amountSatang: number
  label: string
  category: string | null
}

export type OptimisticDeps<TRestore> = {
  /** Server action. May reject (offline) or resolve with `{ error }` (rejected write). */
  create: () => Promise<{ error: string }>
  addPending: (tempId: string) => void
  removePending: (tempId: string) => void
  notifySuccess: () => void
  notifyError: (message: string) => void
  /** Re-open the form with the user's work intact. */
  onFailure: (restore: TRestore) => void
  restore: TRestore
  tempId: string
}

export async function runOptimisticCreate<TRestore>({
  create,
  addPending,
  removePending,
  notifySuccess,
  notifyError,
  onFailure,
  restore,
  tempId,
}: OptimisticDeps<TRestore>): Promise<void> {
  addPending(tempId)
  try {
    const result = await create()
    // Removed before branching so BOTH outcomes drop the provisional row —
    // an early return or a throw in a branch can never strand it on screen.
    removePending(tempId)
    if (result.error) {
      notifyError(result.error)
      onFailure(restore)
      return
    }
    notifySuccess()
  } catch (e: unknown) {
    removePending(tempId)
    // A thrown request (offline, aborted, connection refused) is as much a
    // failed write as a rejected one and must be equally loud.
    notifyError(e instanceof Error ? e.message : String(e))
    onFailure(restore)
  }
}

export function newTempId(): string {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
