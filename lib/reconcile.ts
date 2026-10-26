import { z } from 'zod'

export const ADJUSTMENT_CATEGORY = 'adjustment' as const

/** Positive means the app is higher than the bank; negative means the bank is higher. */
export function reconcileGap(appBalanceSatang: number, bankBalanceSatang: number): number {
  return appBalanceSatang - bankBalanceSatang
}

export function parseBankBalanceToSatang(input: string): number | null {
  const cleaned = input.replace(/฿/g, '').replace(/,/g, '').replace(/\s/g, '').trim()
  if (!cleaned || !/^-?\d+(?:\.\d{0,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

export function gapProgress(startGapSatang: number, currentGapSatang: number) {
  const start = Math.abs(startGapSatang)
  const current = Math.abs(currentGapSatang)
  const overshoot = startGapSatang !== 0 && currentGapSatang !== 0 && Math.sign(startGapSatang) !== Math.sign(currentGapSatang)
  const explained = overshoot ? start : Math.max(0, Math.min(start, start - current))
  return { start, current, explained, overshoot, done: currentGapSatang === 0 }
}

export type TransactionDateGap = { from: string; to: string }

function bangkokDayKey(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00+07:00`)
  date.setUTCDate(date.getUTCDate() + amount)
  return bangkokDayKey(date)
}

/** Missing Bangkok calendar-day runs in the last 14 days, never before the first row or including today. */
export function findRecentTransactionGaps(datetimes: string[], now: Date = new Date()): TransactionDateGap[] {
  if (datetimes.length === 0) return []
  const days = [...new Set(datetimes.map((value) => bangkokDayKey(value)))].sort()
  const today = bangkokDayKey(now)
  const yesterday = shiftDay(today, -1)
  const windowStart = shiftDay(today, -13)
  const start = days[0] > windowStart ? days[0] : windowStart
  const present = new Set(days)
  const gaps: TransactionDateGap[] = []
  let open: TransactionDateGap | null = null
  for (let day = start; day <= yesterday; day = shiftDay(day, 1)) {
    if (!present.has(day)) {
      if (!open) open = { from: day, to: day }
      else open.to = day
    } else if (open) {
      gaps.push(open)
      open = null
    }
  }
  if (open) gaps.push(open)
  return gaps
}

export type ReconcileRemainderInput = {
  accountId: string
  bankBalanceSatang: number
  expectedAppBalanceSatang: number
  datetime: string
}

export const reconcileRemainderSchema = z.object({
  accountId: z.string().uuid(),
  bankBalanceSatang: z.number().int().safe(),
  expectedAppBalanceSatang: z.number().int().safe(),
  datetime: z.string().datetime({ offset: true }),
})

export type ReconcileRepository = {
  getAccountBalance(accountId: string): Promise<number | null>
  insertAdjustment(row: {
    accountId: string
    type: 'expense' | 'income'
    amountSatang: number
    datetime: string
  }): Promise<string>
  stampReconciled(accountId: string, reconciledAt: string): Promise<void>
  removeAdjustment(transactionId: string): Promise<void>
}

export type ReconcileRemainderResult =
  | { status: 'saved'; transactionId: string | null; balanceSatang: number }
  | { status: 'stale'; balanceSatang: number }
  | { status: 'error'; error: string }

/**
 * Shared service seam for the UI action and the future Phase-C REST route.
 * It always re-reads server truth and never trusts the amount shown by the client.
 */
export async function performReconcileRemainder(
  input: ReconcileRemainderInput,
  repository: ReconcileRepository,
  now = () => new Date().toISOString(),
): Promise<ReconcileRemainderResult> {
  let current: number | null
  try {
    current = await repository.getAccountBalance(input.accountId)
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : 'อ่านยอดล่าสุดไม่สำเร็จ' }
  }
  if (current === null) return { status: 'error', error: 'ไม่พบบัญชี' }
  if (current !== input.expectedAppBalanceSatang) return { status: 'stale', balanceSatang: current }

  const gap = reconcileGap(current, input.bankBalanceSatang)
  let transactionId: string | null = null
  try {
    if (gap !== 0) {
      transactionId = await repository.insertAdjustment({
        accountId: input.accountId,
        type: gap > 0 ? 'expense' : 'income',
        amountSatang: Math.abs(gap),
        datetime: input.datetime,
      })
    }
    await repository.stampReconciled(input.accountId, now())
    return { status: 'saved', transactionId, balanceSatang: input.bankBalanceSatang }
  } catch (error) {
    if (transactionId) {
      try { await repository.removeAdjustment(transactionId) } catch { /* preserve the original failure */ }
    }
    return { status: 'error', error: error instanceof Error ? error.message : 'บันทึกยอดปรับไม่สำเร็จ' }
  }
}
