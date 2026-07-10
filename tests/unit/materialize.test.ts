// Regression coverage for the two M7-D code defects fixed in
// lib/recurrence/materialize.ts: (1) one poisoned rule must not starve every
// other rule's insert/guard-advance (previously a single all-or-nothing batch
// across all rules), and (2) materialization must clamp to today (Asia/Bangkok),
// never deducting the rest of the month up front.
//
// materialize.ts is server-only (real Supabase I/O), so this test mocks
// `@/lib/supabase/server` with a minimal chainable fake rather than hitting a
// live DB — vitest.config.ts aliases the bare `server-only` import to a no-op
// stub so the module resolves at all under Vitest.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateClient = vi.fn()
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
  getUser: () => mockGetUser(),
}))

import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { todayBangkok } from '@/lib/recurrence/range'

type Row = Record<string, unknown>

interface FakeState {
  rules: Row[]
  failInsertForRule?: string
  failGuardForRule?: string
  inserted: Row[][]
  guardUpdates: string[]
  guardPayloads: Record<string, string>
}

/** Minimal chainable fake standing in for the supabase-js query builder — just
 * enough method surface for materializeOccurrences' exact call shapes. */
function makeFakeSupabase(state: FakeState) {
  function chain(table: string) {
    let mode: 'select' | 'insert' | 'update' = 'select'
    let payload: Row[] | Row | null = null
    const filters: Record<string, unknown> = {}

    const builder = {
      select: () => builder,
      insert: (rows: Row[]) => { mode = 'insert'; payload = rows; return builder },
      update: (data: Row) => { mode = 'update'; payload = data; return builder },
      eq: (col: string, val: unknown) => { filters[col] = val; return builder },
      in: (col: string, vals: unknown[]) => { filters[col] = vals; return builder },
      not: () => builder,
      gte: () => builder,
      lte: () => builder,
      order: () => builder,
      then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
        let result: { data: unknown; error: unknown }
        if (table === 'recurring_rules' && mode === 'select') {
          result = { data: state.rules, error: null }
        } else if (table === 'recurring_rules' && mode === 'update') {
          const ruleId = filters.id as string
          state.guardUpdates.push(ruleId)
          state.guardPayloads[ruleId] = (payload as Row).materialized_through as string
          result =
            ruleId === state.failGuardForRule
              ? { data: null, error: { message: 'guard failed' } }
              : { data: null, error: null }
        } else if (table === 'recurring_exceptions') {
          result = { data: [], error: null }
        } else if (table === 'transactions' && mode === 'select') {
          result = { data: [], error: null }
        } else if (table === 'transactions' && mode === 'insert') {
          const rows = payload as Row[]
          state.inserted.push(rows)
          const ruleId = rows[0]?.recurring_rule_id as string
          result =
            ruleId === state.failInsertForRule
              ? { data: null, error: { message: 'insert failed' } }
              : { data: null, error: null }
        } else {
          result = { data: [], error: null }
        }
        return Promise.resolve(result).then(resolve)
      },
    }
    return builder
  }
  return { from: chain }
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

describe('materializeOccurrences — per-rule isolation (M7-D)', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ id: 'user-1' })
  })

  it("one poisoned rule's insert failure does not block another rule's insert or guard advance", async () => {
    const today = todayBangkok()
    const [y, m] = today.split('-')
    const monthStart = `${y}-${m}-01`
    const monthEnd = `${y}-${m}-28` // always <= any real month's last day

    const rules: Row[] = [
      {
        id: 'rule-a', user_id: 'user-1', type: 'expense', amount_satang: 1000, category: null,
        account_id: 'acct-a', freq: 'monthly', interval: 1, by_weekday: null,
        start_date: monthStart, end_date: null, materialized_through: null,
      },
      {
        id: 'rule-b', user_id: 'user-1', type: 'expense', amount_satang: 2000, category: null,
        account_id: 'acct-b', freq: 'monthly', interval: 1, by_weekday: null,
        start_date: monthStart, end_date: null, materialized_through: null,
      },
    ]

    const state: FakeState = {
      rules, failInsertForRule: 'rule-b', inserted: [], guardUpdates: [], guardPayloads: {},
    }
    mockCreateClient.mockResolvedValue(makeFakeSupabase(state))

    const { inserted: anyInserted, results } = await materializeOccurrences(monthStart, monthEnd)

    // rule-a's occurrence still landed despite rule-b failing — not an
    // all-or-nothing batch.
    expect(anyInserted).toBe(true)

    const byRule = Object.fromEntries(results.map((r) => [r.ruleId, r]))
    expect(byRule['rule-a'].ok).toBe(true)
    expect(byRule['rule-b'].ok).toBe(false)
    expect(byRule['rule-b'].error).toBe('insert failed')

    // rule-a's guard advanced; rule-b's did not (its insert error short-circuits
    // before the guard update — so the next load retries rule-b's window).
    expect(state.guardUpdates).toContain('rule-a')
    expect(state.guardUpdates).not.toContain('rule-b')
  })

  it('a guard-update failure is also reported per-rule, not thrown for the whole batch', async () => {
    const today = todayBangkok()
    const [y, m] = today.split('-')
    const monthStart = `${y}-${m}-01`
    const monthEnd = `${y}-${m}-28`

    const rules: Row[] = [
      {
        id: 'rule-ok', user_id: 'user-1', type: 'expense', amount_satang: 500, category: null,
        account_id: 'acct-a', freq: 'monthly', interval: 1, by_weekday: null,
        start_date: monthStart, end_date: null, materialized_through: null,
      },
      {
        id: 'rule-guard-fails', user_id: 'user-1', type: 'expense', amount_satang: 700, category: null,
        account_id: 'acct-b', freq: 'monthly', interval: 1, by_weekday: null,
        start_date: monthStart, end_date: null, materialized_through: null,
      },
    ]
    const state: FakeState = {
      rules, failGuardForRule: 'rule-guard-fails', inserted: [], guardUpdates: [], guardPayloads: {},
    }
    mockCreateClient.mockResolvedValue(makeFakeSupabase(state))

    const { results } = await materializeOccurrences(monthStart, monthEnd)
    const byRule = Object.fromEntries(results.map((r) => [r.ruleId, r]))
    expect(byRule['rule-ok'].ok).toBe(true)
    expect(byRule['rule-guard-fails'].ok).toBe(false)
    expect(byRule['rule-guard-fails'].error).toBe('guard failed')
  })
})

describe('materializeOccurrences — clamps to today, not the whole window (M7-D / J7)', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ id: 'user-1' })
  })

  it('a weekly rule due multiple times in [from, to] only materializes through today', async () => {
    const today = todayBangkok()
    const farFuture = addDaysISO(today, 30) // spans ~4 weekly occurrences past today

    const rules: Row[] = [
      {
        id: 'rule-weekly', user_id: 'user-1', type: 'expense', amount_satang: 500, category: null,
        account_id: 'acct-a', freq: 'weekly', interval: 1, by_weekday: null,
        start_date: today, end_date: null, materialized_through: null,
      },
    ]
    const state: FakeState = { rules, inserted: [], guardUpdates: [], guardPayloads: {} }
    mockCreateClient.mockResolvedValue(makeFakeSupabase(state))

    await materializeOccurrences(today, farFuture)

    // Exactly one insert call, exactly one row (today's own occurrence) — not the
    // 4-5 weekly rows an unclamped [today, today+30] window would generate.
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toHaveLength(1)
    expect(state.inserted[0][0].occurrence_date).toBe(today)

    // The guard advances to today, not to the caller's far-future `to`.
    expect(state.guardPayloads['rule-weekly']).toBe(today)
  })
})
