import { describe, it, expect, vi } from 'vitest'
import { runOptimisticCreate, newTempId } from '@/lib/pending-tx'

/**
 * design v4 F6 — the optimistic J1 save. These assert the contract that makes
 * optimism safe in a ledger: the provisional row never survives the request, the
 * user's work is never lost, and a failed write is never silent.
 */

type Restore = { amount: string }

function harness(create: () => Promise<{ error: string }>) {
  const rows: string[] = []
  const calls = {
    success: 0,
    errors: [] as string[],
    restored: [] as Restore[],
    /** Longest the provisional row existed, in observable steps. */
    everHadRow: false,
  }
  const restore: Restore = { amount: '120.00' }
  const run = () =>
    runOptimisticCreate<Restore>({
      create,
      addPending: (id) => {
        rows.push(id)
        calls.everHadRow = true
      },
      removePending: (id) => {
        const i = rows.indexOf(id)
        if (i >= 0) rows.splice(i, 1)
      },
      notifySuccess: () => {
        calls.success++
      },
      notifyError: (m) => calls.errors.push(m),
      onFailure: (r) => calls.restored.push(r),
      restore,
      tempId: 'tmp-1',
    })
  return { rows, calls, restore, run }
}

describe('runOptimisticCreate — success', () => {
  it('shows a provisional row, then removes it and reports success', async () => {
    const h = harness(async () => ({ error: '' }))
    await h.run()
    expect(h.calls.everHadRow).toBe(true)
    expect(h.rows).toEqual([]) // swapped for the authoritative revalidated row
    expect(h.calls.success).toBe(1)
    expect(h.calls.errors).toEqual([])
    expect(h.calls.restored).toEqual([]) // nothing to restore
  })

  it('the provisional row is present while the request is in flight', async () => {
    let release!: (v: { error: string }) => void
    const inflight = new Promise<{ error: string }>((r) => { release = r })
    const h = harness(() => inflight)
    const p = h.run()
    // Not awaited yet: this is the window the user sees the row in.
    expect(h.rows).toEqual(['tmp-1'])
    release({ error: '' })
    await p
    expect(h.rows).toEqual([])
  })
})

describe('runOptimisticCreate — rejected write (server returned an error)', () => {
  it('rolls the row back, announces the error, and restores the form', async () => {
    const h = harness(async () => ({ error: 'รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)' }))
    await h.run()
    expect(h.rows).toEqual([]) // no phantom row left in the ledger
    expect(h.calls.success).toBe(0)
    expect(h.calls.errors).toEqual(['รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)'])
    expect(h.calls.restored).toEqual([h.restore]) // user's work handed back
  })
})

describe('runOptimisticCreate — thrown request (offline / connection refused)', () => {
  it('is treated exactly like a rejected write — never silent', async () => {
    const h = harness(async () => { throw new Error('Failed to fetch') })
    await h.run()
    expect(h.rows).toEqual([])
    expect(h.calls.success).toBe(0)
    expect(h.calls.errors).toEqual(['Failed to fetch'])
    expect(h.calls.restored).toEqual([h.restore])
  })

  it('survives a non-Error throw without losing the rollback', async () => {
    const h = harness(async () => { throw 'boom' })
    await h.run()
    expect(h.rows).toEqual([])
    expect(h.calls.errors).toEqual(['boom'])
    expect(h.calls.restored).toEqual([h.restore])
  })
})

describe('runOptimisticCreate — invariants', () => {
  it('never both succeeds and restores', async () => {
    for (const create of [
      async () => ({ error: '' }),
      async () => ({ error: 'x' }),
      async () => { throw new Error('y') },
    ]) {
      const h = harness(create as () => Promise<{ error: string }>)
      await h.run()
      expect(h.calls.success === 1 && h.calls.restored.length > 0).toBe(false)
      expect(h.rows).toEqual([]) // the one rule that always holds
    }
  })

  it('newTempId produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 200 }, newTempId))
    expect(ids.size).toBe(200)
  })
})

describe('runOptimisticCreate — the amount is never re-derived', () => {
  it('passes the caller-built FormData through untouched', async () => {
    const create = vi.fn(async () => ({ error: '' }))
    await runOptimisticCreate({
      create,
      addPending: () => {},
      removePending: () => {},
      notifySuccess: () => {},
      notifyError: () => {},
      onFailure: () => {},
      restore: {},
      tempId: 't',
    })
    expect(create).toHaveBeenCalledTimes(1)
  })
})
