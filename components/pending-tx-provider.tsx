'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createTransaction } from '@/app/actions/transactions'
import { newTempId, runOptimisticCreate, type PendingTx } from '@/lib/pending-tx'
import type { TxFormValues } from '@/lib/quick-add'

export type { PendingTx }

type PendingTxContext = {
  pending: PendingTx[]
  /**
   * Fire-and-forget optimistic create (design v4 F6 — J1 only).
   *
   * The mutation deliberately lives HERE and not in `TransactionForm`: the
   * quick-add sheet unmounts its content when it closes, so an in-flight action
   * owned by the form would be torn down mid-request and neither the rollback
   * nor `toast.error` would ever run. Closing the sheet instantly is the whole
   * point of F6, so the request has to outlive the form.
   */
  submit: (fd: FormData, preview: Omit<PendingTx, 'tempId'>, restore: TxFormValues) => void
}

/**
 * Default context (SPEC5-3). `pending` reads safely as empty — a consumer that
 * only renders provisional rows outside a provider should show none, not crash.
 * But `submit` **throws**: `transaction-form.tsx` calls `onSuccess?.()`
 * immediately after it, so a silent no-op here would close the sheet reporting
 * success while the transaction was **discarded**. Unreachable today (only
 * `AppShell` passes `optimistic`, and `AppShell` is what mounts the provider) —
 * this exists so that if that pairing is ever broken, a finance app fails loudly
 * instead of quietly losing a write.
 */
const outsideProvider: PendingTxContext = {
  pending: [],
  submit: () => {
    throw new Error(
      'usePendingTx().submit was called outside <PendingTxProvider>. The optimistic ' +
        'save path requires the provider — without it the sheet would report success ' +
        'and drop the transaction. Pass `optimistic` only where the provider is mounted.',
    )
  },
}
const Ctx = createContext<PendingTxContext>(outsideProvider)

export function usePendingTx() {
  return useContext(Ctx)
}

export default function PendingTxProvider({
  onFailure,
  children,
}: {
  /** Re-open the quick-add sheet with the user's values intact (F6 rule 4). */
  onFailure: (restore: TxFormValues) => void
  children: React.ReactNode
}) {
  const t = useTranslations('transaction')
  const [pending, setPending] = useState<PendingTx[]>([])

  const submit = useCallback(
    (fd: FormData, preview: Omit<PendingTx, 'tempId'>, restore: TxFormValues) => {
      // Orchestration lives in `lib/pending-tx.ts` so the rollback contract is
      // unit-testable without a DOM (tests/unit/pending-tx.test.ts). On success
      // the provisional row is dropped because the revalidated server data
      // already carries the real one — the action awaits its revalidatePath
      // calls before resolving — so this swaps provisional for authoritative
      // rather than leaving both on screen.
      void runOptimisticCreate({
        create: () => createTransaction({ error: '' }, fd),
        addPending: (tempId) => setPending((p) => [{ ...preview, tempId }, ...p]),
        removePending: (tempId) => setPending((p) => p.filter((x) => x.tempId !== tempId)),
        notifySuccess: () => toast.success(t('saved')),
        notifyError: (m) => toast.error(m),
        onFailure,
        restore,
        tempId: newTempId(),
      })
    },
    [onFailure, t],
  )

  const value = useMemo(() => ({ pending, submit }), [pending, submit])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
