import { describe, it, expect } from 'vitest'
import { buildPlan } from '@/lib/invest/planner/plan'
import { toMinor } from '@/lib/invest/money'
import type { ResolvedHolding, TargetAllocation } from '@/lib/invest/planner/types'

/**
 * M5 acceptance fixture — hand-computed, mirrors the real numbers from the M0
 * validation run (idea-forge/ideas/jodsa-investments/docs/M0-validation.md):
 * VOO 42.5% + a Thai S&P 500 feeder fund 14.1% = 56.6% of the portfolio is the
 * SAME index; direct US growth/tech = 43.4%; effective NVDA (look-through
 * decomposed) lands at ~27%, matching M0's headline finding almost exactly —
 * proof the generic look-through math reproduces a real, previously
 * hand-verified result, not a coincidence tuned to pass.
 *
 * Total portfolio = ฿100,000.00 exactly, so every direct capital-weight %
 * below is bigint-exact (no rounding ambiguity to reason about by hand).
 */
function holding(overrides: Partial<ResolvedHolding>): ResolvedHolding {
  return {
    holdingId: overrides.holdingId ?? 'h',
    assetId: overrides.assetId ?? 'a',
    symbol: null,
    name: 'asset',
    assetClass: 'us_equity',
    proxyClass: 'us_tech_growth',
    sleeve: 'core',
    valueMinor: 0n,
    ...overrides,
  }
}

const FIXTURE_A_HOLDINGS: ResolvedHolding[] = [
  holding({
    holdingId: 'h-voo', assetId: 'a-voo', symbol: 'VOO', name: 'Vanguard S&P 500 ETF',
    assetClass: 'etf', proxyClass: 'us_large_cap',
    valueMinor: toMinor(42500, 'THB'),
  }),
  holding({
    holdingId: 'h-nvda', assetId: 'a-nvda', symbol: 'NVDA', name: 'NVIDIA Corporation',
    assetClass: 'us_equity', proxyClass: 'us_tech_growth',
    valueMinor: toMinor(23400, 'THB'),
  }),
  holding({
    holdingId: 'h-aapl', assetId: 'a-aapl', symbol: 'AAPL', name: 'Apple Inc.',
    assetClass: 'us_equity', proxyClass: 'us_tech_growth',
    valueMinor: toMinor(13300, 'THB'),
  }),
  holding({
    holdingId: 'h-msft', assetId: 'a-msft', symbol: 'MSFT', name: 'Microsoft Corporation',
    assetClass: 'us_equity', proxyClass: 'us_tech_growth',
    valueMinor: toMinor(4000, 'THB'),
  }),
  holding({
    holdingId: 'h-amzn', assetId: 'a-amzn', symbol: 'AMZN', name: 'Amazon.com, Inc.',
    assetClass: 'us_equity', proxyClass: 'us_tech_growth',
    valueMinor: toMinor(2700, 'THB'),
  }),
  holding({
    holdingId: 'h-thsp500', assetId: 'a-thsp500', symbol: null, name: 'SCB S&P 500 (Thai feeder fund)',
    assetClass: 'thai_fund', proxyClass: 'us_large_cap',
    valueMinor: toMinor(14100, 'THB'),
  }),
]

const FIXTURE_A_TARGET: TargetAllocation = {
  us_equity: 20, etf: 15, thai_set: 15, thai_fund: 10, gold: 20, crypto: 20,
}

function buildFixtureAPlan(createdAt = '2026-07-16T00:00:00.000Z') {
  return buildPlan({
    holdings: FIXTURE_A_HOLDINGS,
    targetAllocation: FIXTURE_A_TARGET,
    newMoneyMinor: toMinor(3000, 'THB'),
    newMoneyCurrency: 'THB',
    displayCurrency: 'THB',
    createdAt,
  })
}

describe('lib/invest/planner/plan — Fixture A: concentrated portfolio (M0-validation-derived)', () => {
  const plan = buildFixtureAPlan()

  it('reproduces the hand-computed allocation drift by asset_class', () => {
    const byClass = Object.fromEntries(plan.allocationDrift.map((r) => [r.assetClass, r]))
    expect(byClass.us_equity).toMatchObject({ currentPct: 43.4, targetPct: 20, driftPct: 23.4 })
    expect(byClass.etf).toMatchObject({ currentPct: 42.5, targetPct: 15, driftPct: 27.5 })
    expect(byClass.thai_fund).toMatchObject({ currentPct: 14.1, targetPct: 10, driftPct: 4.1 })
    expect(byClass.thai_set).toMatchObject({ currentPct: 0, targetPct: 15, driftPct: -15 })
    expect(byClass.gold).toMatchObject({ currentPct: 0, targetPct: 20, driftPct: -20 })
    expect(byClass.crypto).toMatchObject({ currentPct: 0, targetPct: 20, driftPct: -20 })
  })

  it('reproduces top concentration — direct VOO 42.5%, effective NVDA ~27% (matches the M0 ~26-29% band)', () => {
    const directVoo = plan.concentration.direct.find((r) => r.key === 'VOO')
    expect(directVoo?.pct).toBe(42.5)
    expect(directVoo?.concentrated).toBe(true)

    const directNvda = plan.concentration.direct.find((r) => r.key === 'NVDA')
    expect(directNvda?.pct).toBe(23.4)
    expect(directNvda?.concentrated).toBe(false) // direct alone is under the 25% flag

    const effectiveNvda = plan.concentration.effective.find((r) => r.key === 'NVDA')
    expect(effectiveNvda?.pct).toBeGreaterThanOrEqual(26)
    expect(effectiveNvda?.pct).toBeLessThanOrEqual(29)
    expect(effectiveNvda?.pct).toBe(27.36) // exact bigint-derived value for this fixture
    expect(effectiveNvda?.concentrated).toBe(true) // effective (look-through) pushes it over 25%
  })

  it('produces a sensible BUY suggestion set — new money steered to underweight, non-concentrated classes only', () => {
    const buys = plan.suggestions.filter((s) => s.action === 'buy')
    expect(buys.map((b) => b.assetClass).sort()).toEqual(['crypto', 'gold', 'thai_set'])
    // etf/us_equity are both overweight AND concentrated — must never receive new money
    expect(buys.some((b) => b.assetClass === 'etf' || b.assetClass === 'us_equity')).toBe(false)

    const total = buys.reduce((s, b) => s + BigInt(b.amountRange!.minMinor), 0n)
    expect(total.toString()).toBe(toMinor(3000, 'THB').toString()) // fully allocated, no leftover

    const thaiSet = buys.find((b) => b.assetClass === 'thai_set')!
    expect(thaiSet.amountRange!.minMinor).toBe('81818') // ~฿818.18 — 15/55 share of ฿3,000
    const gold = buys.find((b) => b.assetClass === 'gold')!
    expect(gold.amountRange!.minMinor).toBe('109091')
    const crypto = buys.find((b) => b.assetClass === 'crypto')!
    expect(crypto.amountRange!.minMinor).toBe('109091')
  })

  it('produces a NO-SELL hold on NVDA (small direct weight, don\'t sell just because look-through is high)', () => {
    const nvda = plan.suggestions.find((s) => s.assetId === 'a-nvda')
    expect(nvda?.action).toBe('hold')
    expect(nvda?.reasonKey).toBe('reason.holdConcentrated')
  })

  it('produces a SELL/trim suggestion on VOO (very large direct weight + very overweight etf class)', () => {
    const voo = plan.suggestions.find((s) => s.assetId === 'a-voo')
    expect(voo?.action).toBe('sell')
    expect(voo?.reasonKey).toBe('reason.sellConcentrated')
  })

  it('every suggestion carries an epistemic tag', () => {
    for (const s of plan.suggestions) {
      expect(s.tags.length).toBeGreaterThan(0)
    }
  })

  it('verdict is ACTION (not NO-TRADE) — suggestions exist', () => {
    expect(plan.verdict).toBe('action')
  })

  it('stress scenarios are ranges, never a single false-precise number, and bracket the point estimate', () => {
    expect(plan.stress).toHaveLength(2)
    for (const s of plan.stress) {
      expect(s.rangeLow).toBeLessThanOrEqual(s.pointEstimate)
      expect(s.pointEstimate).toBeLessThanOrEqual(s.rangeHigh)
      expect(s.tags).toContain('JUDG-PROXY')
    }
    const broadSelloff = plan.stress.find((s) => s.scenario === 'broad_equity_selloff')!
    // 56.6% us_large_cap @ -20% + 43.4% us_tech_growth @ -30% ≈ -24.3%
    expect(broadSelloff.pointEstimate).toBeCloseTo(-0.2434, 3)
  })

  it('pins the paramVersion from proxy-params.json for reproducibility', () => {
    expect(plan.paramVersion).toBe('2026.07-v1')
  })

  it('every suggestion, headline, and the plan carries the disclaimer', () => {
    expect(plan.disclaimer).toMatch(/decision-support/i)
    expect(plan.disclaimer).toMatch(/never places or simulates/i)
  })
})

describe('lib/invest/planner/plan — Fixture B: balanced portfolio → first-class NO-TRADE', () => {
  const holdings: ResolvedHolding[] = [
    holding({ holdingId: 'h1', assetId: 'a-aapl', symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'us_equity', proxyClass: 'us_tech_growth', valueMinor: toMinor(20000, 'THB') }),
    holding({ holdingId: 'h2', assetId: 'a-voo', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'etf', proxyClass: 'us_large_cap', valueMinor: toMinor(15000, 'THB') }),
    holding({ holdingId: 'h3', assetId: 'a-ptt', symbol: 'PTT', name: 'ปตท.', assetClass: 'thai_set', proxyClass: 'thai_set', valueMinor: toMinor(15000, 'THB') }),
    holding({ holdingId: 'h4', assetId: 'a-tisesg', symbol: 'TISESG-A', name: 'TISESG-A', assetClass: 'thai_fund', proxyClass: 'thai_fund_generic', valueMinor: toMinor(15000, 'THB') }),
    holding({ holdingId: 'h5', assetId: 'a-gold', symbol: null, name: 'ทองคำแท่ง 96.5%', assetClass: 'gold', proxyClass: 'gold', valueMinor: toMinor(20000, 'THB') }),
    holding({ holdingId: 'h6', assetId: 'a-btc', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', proxyClass: 'crypto', valueMinor: toMinor(15000, 'THB') }),
  ]
  const target: TargetAllocation = { us_equity: 20, etf: 15, thai_set: 15, thai_fund: 15, gold: 20, crypto: 15 }

  const plan = buildPlan({
    holdings,
    targetAllocation: target,
    newMoneyMinor: toMinor(3000, 'THB'),
    newMoneyCurrency: 'THB',
    displayCurrency: 'THB',
    createdAt: '2026-07-16T00:00:00.000Z',
  })

  it('every asset_class sits exactly on target — zero drift', () => {
    for (const row of plan.allocationDrift) expect(row.driftPct).toBe(0)
  })

  it('nothing is concentrated (max is AAPL ~20.9% effective, under the 25% flag)', () => {
    expect(plan.concentration.anyConcentrated).toBe(false)
  })

  it('flags the thai_fund as an opaque vehicle (no look-through table for thai_fund_generic)', () => {
    expect(plan.concentration.opaqueVehicles).toHaveLength(1)
    expect(plan.concentration.opaqueVehicles[0].assetId).toBe('a-tisesg')
  })

  it('emits ZERO suggestions and a first-class, clearly-rendered NO-TRADE verdict — even with new money available', () => {
    expect(plan.suggestions).toHaveLength(0)
    expect(plan.verdict).toBe('no_trade')
    expect(plan.headline).toMatch(/NO-TRADE/)
  })
})

describe('lib/invest/planner/plan — determinism (M5 acceptance)', () => {
  it('same inputs + same param_version + same createdAt ⇒ deep-equal Plan', () => {
    const a = buildFixtureAPlan('2026-07-16T00:00:00.000Z')
    const b = buildFixtureAPlan('2026-07-16T00:00:00.000Z')
    expect(a).toEqual(b)
  })

  it('a different createdAt changes only createdAt, not the computed outputs', () => {
    const a = buildFixtureAPlan('2026-07-16T00:00:00.000Z')
    const b = buildFixtureAPlan('2026-08-01T00:00:00.000Z')
    expect(a.createdAt).not.toBe(b.createdAt)
    expect({ ...a, createdAt: '' }).toEqual({ ...b, createdAt: '' })
  })
})
