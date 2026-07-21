# Post-mortem — F6 optimistic save was inert in the shipped app (QA-SPEC5-1)

**Date:** 2026-07-21
**Area:** design v4 F6 — optimistic J1 save (`components/transaction-form.tsx`, `components/pending-tx-provider.tsx`, `lib/pending-tx.ts`)
**Found by:** qa-lab E2E run (QA-SPEC5, `qa-lab/projects/jodsa/runs/QA-SPEC5-2026-07-21.md`) → RED
**Severity:** high — the headline behaviour of F6 (instant, non-blocking logging on the most repeated action in the product) did not work at all in the built app, while every static check, type check, unit test and the dev's own browser self-check passed.

## Symptom

Saving from Home's quick-add sheet behaved exactly like the pre-F6 blocking path: the sheet stayed open on a disabled "กำลังบันทึก..." button until the server write resolved (~1–1.7 s), no provisional row ever painted, and only then did the sheet close. qa-lab's `MutationObserver` on `.opacity-60` recorded the provisional row **zero** times.

## Why the earlier verification missed it

- **Unit tests (`pending-tx.test.ts`, 8) were green** — they exercise the pure orchestrator `runOptimisticCreate` in isolation, which is correct. The defect was one layer up, in how React committed the state updates the orchestrator and its caller triggered. Pure-function tests cannot see a React-transition commit-timing bug.
- **The dev's manual browser check was green but non-discriminating** — it observed the end state (sheet closed, balance moved, real row present) *without a delayed server action*, so it could not tell an instant optimistic close from a ~1 s blocking close. Same blind spot that produced SPEC5-1's earlier datetime miss: verifying an outcome that both paths share.
- **qa-lab caught it** precisely because its E2E *delayed the server action* and asserted the sheet closed **before** the write resolved — the one observation that separates optimistic from blocking.

## Root cause

`useActionState` runs its reducer inside a React transition. React 19 holds the **commit** of every state update made within that transition — here `addPending` (the provisional row) and `onSuccess → setOpen(false)` (the instant close) — until the transition settles. A **Server Action invoked synchronously within the reducer's call stack keeps the transition pending until that action resolves.**

The optimistic branch called `pendingTx.submit(...)` synchronously in the reducer; `submit` → `runOptimisticCreate` → `await create()` invoked the `createTransaction` Server Action **in that same synchronous scope**. So React tied the transition to the fire-and-forget write and deferred the row + sheet-close commit until the POST landed. The branch *ran* — instrumentation proved `entered / calledSubmit / calledOnSuccess` all true — but its visible effects were withheld until the write completed, which is indistinguishable from blocking.

This is why qa-lab's inference ("the optimistic branch does not execute") was directionally right about the *behaviour* but wrong about the *mechanism*: the branch executes; React just doesn't commit its updates on time.

## How it was found

Static reading could not explain it — the branch condition provably evaluated true (a top-of-reducer probe showed `optimistic:true, editId:undefined, branchWouldRun:true`) yet the blocking behaviour persisted. Root cause required **instrumenting the actual path** and **measuring commit timing against a delayed POST**:

1. A throwaway probe object written from inside the branch confirmed the branch body ran to completion (`calledOnSuccess:true`).
2. A throwaway Playwright spec delayed the action POST 4 s and sampled at +800 ms: `sheetOpenEarly:true, pendingRowsEarly:0` — the branch had run but nothing had committed. That isolated the fault to transition commit-timing, not branch selection.

## Fix

Defer the optimistic side effects one macrotask, out of the reducer's transition (`components/transaction-form.tsx`):

```ts
setTimeout(() => {
  pendingTx.submit(fd, preview, restoreValues)
  onSuccess?.()
}, 0)
return { error: '' }
```

By the time the `setTimeout` callback runs, the reducer has returned and the transition has settled with no async tied to it, so `addPending` and `setOpen(false)` commit immediately; the write still fires, now detached from the transition. Deferring only `create()` inside `runOptimisticCreate` was tried first and was **insufficient** — `onSuccess` (the sheet close) lives in the reducer itself and was still being withheld; the whole side-effect block had to leave the transition.

## Validation

- The two E2E specs that were RED (`spec5-optimistic.spec.ts` F6 happy-path + SPEC5-1 forced-failure) now pass; full SPEC-5 E2E **11/11** green.
- **The fix was proven to be what flipped them:** with the app fix `git stash`-ed out, both regression specs fail RED again; restored, they pass. The tests genuinely guard this regression rather than having been loosened to accommodate it.
- The forced-failure spec's failure-injection was changed from an instant abort to **delay-then-abort** (`routeServerAction` now applies `delayMs` before `abort`): a zero-delay abort let React batch the close+reopen into one commit, hiding the closed frame and false-*failing* the corrected app. The delayed variant makes the closed state observable **and still fails on the old blocking code** (verified by the stash test above), so the anti-false-pass gate is preserved, not defanged.
- tsc 0 · lint clean · vitest 295 passed / 34 skipped.

## Lessons

- **Optimistic UI must not launch its write from inside a `useActionState` reducer.** A Server Action called synchronously in a transition ties that transition's commit to the write, silently converting "optimistic" back into "blocking". Start fire-and-forget writes outside the transition (a deferred macrotask, or a plain event handler rather than a form action).
- **Verify the property that distinguishes the two implementations, not an outcome they share.** Both blocking and optimistic end with "sheet closed, row present". Only a *delayed* write reveals *when* the UI commits — that timing was the whole spec. This is the second SPEC-5 defect (after the datetime restore) that slipped because verification checked a shared outcome; the pattern is worth remembering.
- **A green pure-unit test is not evidence a React integration works.** The orchestrator was correct in isolation and broken in the tree.
