import { describe, expect, it, vi } from 'vitest'
import {
  gapProgress,
  findRecentTransactionGaps,
  parseBankBalanceToSatang,
  performReconcileRemainder,
  reconcileGap,
  type ReconcileRepository,
} from '@/lib/reconcile'

function repository(balance: number): ReconcileRepository & {
  insertAdjustment: ReturnType<typeof vi.fn>
  stampReconciled: ReturnType<typeof vi.fn>
  removeAdjustment: ReturnType<typeof vi.fn>
} {
  return {
    getAccountBalance: vi.fn().mockResolvedValue(balance),
    insertAdjustment: vi.fn().mockResolvedValue('tx-adjustment'),
    stampReconciled: vi.fn().mockResolvedValue(undefined),
    removeAdjustment: vi.fn().mockResolvedValue(undefined),
  }
}

describe('C1 reconcile gap calculation', () => {
  it('uses app minus bank so a positive gap means a missing outflow', () => {
    expect(reconcileGap(1_296_400, 1_255_200)).toBe(41_200)
    expect(reconcileGap(1_000, 1_500)).toBe(-500)
    expect(reconcileGap(800, 800)).toBe(0)
  })

  it('tracks explained, done, and overshoot states', () => {
    expect(gapProgress(41_200, 30_500)).toEqual({ start: 41_200, current: 30_500, explained: 10_700, overshoot: false, done: false })
    expect(gapProgress(41_200, 0).done).toBe(true)
    expect(gapProgress(41_200, -2_000).overshoot).toBe(true)
  })

  it('accepts zero and overdraft balances and rejects over-precision input', () => {
    expect(parseBankBalanceToSatang('0')).toBe(0)
    expect(parseBankBalanceToSatang('12,552.00')).toBe(1_255_200)
    expect(parseBankBalanceToSatang('-1')).toBe(-100)
    expect(parseBankBalanceToSatang('1.234')).toBeNull()
  })

  it('finds missing Bangkok-day runs only inside the recent window and after the first row', () => {
    const gaps = findRecentTransactionGaps([
      '2026-10-20T12:00:00+07:00',
      '2026-10-23T12:00:00+07:00',
      '2026-10-25T12:00:00+07:00',
    ], new Date('2026-10-27T08:00:00+07:00'))
    expect(gaps).toEqual([
      { from: '2026-10-21', to: '2026-10-22' },
      { from: '2026-10-24', to: '2026-10-24' },
      { from: '2026-10-26', to: '2026-10-26' },
    ])
    expect(findRecentTransactionGaps([], new Date('2026-10-27T08:00:00+07:00'))).toEqual([])
  })
})

describe('reconcileRemainder action service', () => {
  const base = {
    accountId: '00000000-0000-4000-8000-000000000001',
    bankBalanceSatang: 1_255_200,
    expectedAppBalanceSatang: 1_296_400,
    datetime: '2026-10-26T23:59:00+07:00',
  }

  it('recomputes server balance, inserts an expense remainder, then stamps reconciled_at', async () => {
    const repo = repository(1_296_400)
    const result = await performReconcileRemainder(base, repo, () => '2026-10-26T12:00:00.000Z')

    expect(result).toEqual({ status: 'saved', transactionId: 'tx-adjustment', balanceSatang: 1_255_200 })
    expect(repo.insertAdjustment).toHaveBeenCalledWith({
      accountId: base.accountId,
      type: 'expense',
      amountSatang: 41_200,
      datetime: base.datetime,
    })
    expect(repo.stampReconciled).toHaveBeenCalledWith(base.accountId, '2026-10-26T12:00:00.000Z')
  })

  it('writes income when bank is higher and writes no transaction when already matched', async () => {
    const incomeRepo = repository(1_000)
    await performReconcileRemainder({ ...base, bankBalanceSatang: 1_500, expectedAppBalanceSatang: 1_000 }, incomeRepo)
    expect(incomeRepo.insertAdjustment).toHaveBeenCalledWith(expect.objectContaining({ type: 'income', amountSatang: 500 }))

    const matchedRepo = repository(1_000)
    await performReconcileRemainder({ ...base, bankBalanceSatang: 1_000, expectedAppBalanceSatang: 1_000 }, matchedRepo)
    expect(matchedRepo.insertAdjustment).not.toHaveBeenCalled()
    expect(matchedRepo.stampReconciled).toHaveBeenCalledOnce()
  })

  it('returns stale and writes nothing when the server balance changed', async () => {
    const repo = repository(1_300_000)
    const result = await performReconcileRemainder(base, repo)
    expect(result).toEqual({ status: 'stale', balanceSatang: 1_300_000 })
    expect(repo.insertAdjustment).not.toHaveBeenCalled()
    expect(repo.stampReconciled).not.toHaveBeenCalled()
  })

  it('removes the inserted adjustment when stamping fails', async () => {
    const repo = repository(1_296_400)
    repo.stampReconciled.mockRejectedValue(new Error('stamp failed'))
    const result = await performReconcileRemainder(base, repo)
    expect(result).toEqual({ status: 'error', error: 'stamp failed' })
    expect(repo.removeAdjustment).toHaveBeenCalledWith('tx-adjustment')
  })
})
