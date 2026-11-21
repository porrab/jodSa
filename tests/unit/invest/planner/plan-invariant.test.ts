import { describe, expect, it, vi } from 'vitest'
import type { ConcentrationResult } from '@/lib/invest/planner/types'

vi.mock('@/lib/invest/planner/concentration', () => ({
  computeConcentration: (): ConcentrationResult => ({
    direct: [],
    effective: [{ key: 'LOOKTHROUGH_ONLY', label: 'Look-through only', pct: 30, concentrated: true }],
    opaqueVehicles: [], threshold: 25, anyConcentrated: true, tags: ['JUDG-PROXY'],
  }),
}))

import { buildPlan } from '@/lib/invest/planner/plan'

describe('planner concentration mapping invariant', () => {
  it('rejects an unmapped concentrated name instead of inventing its asset class', () => {
    expect(() => buildPlan({
      holdings: [],
      targetAllocation: { us_equity: 20, etf: 15, thai_set: 15, thai_fund: 15, gold: 20, crypto: 15 },
      newMoneyMinor: 0n, newMoneyCurrency: 'THB', displayCurrency: 'THB',
      createdAt: '2026-11-21T00:00:00.000Z',
    })).toThrow('Cannot map concentrated exposure LOOKTHROUGH_ONLY to a holding')
  })
})
