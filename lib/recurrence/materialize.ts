import 'server-only'
import { createClient, getUser } from '@/lib/supabase/server'
import { generateOccurrenceDates } from './recurrence'
import { needsMaterialization, clampToToday } from './range'
import type { Database } from '@/lib/supabase/types'

type TxInsert = Database['public']['Tables']['transactions']['Insert']

/** Per-rule outcome of one materialization pass — lets callers (the recurring page,
 * J7) surface a real error state instead of a silent no-op. */
export interface RuleMaterializeResult {
  ruleId: string
  ok: boolean
  error?: string
}

/**
 * Lazy-on-read materialization. Given a [from, to] calendar-date window, create any
 * missing real transaction rows for every recurring rule the current user owns.
 *
 * Idempotent: rows already present (matched by recurring_rule_id + occurrence_date)
 * are skipped, and dates in recurring_exceptions are never regenerated. Safe to call
 * on every page load for the visible range.
 *
 * Cost guard: each rule carries `materialized_through` — the date its occurrences
 * are known to exist through. Rules already covering the effective `to` (see below)
 * are skipped, so the common case (window unchanged since the last load) is a
 * single small query. Rule mutations reset the guard to NULL, which re-opens the
 * window (idempotency makes the re-run safe).
 *
 * Due-date clamp (M7-D / design J7): `to` is clamped to today (Asia/Bangkok)
 * regardless of what the caller passes (e.g. `currentMonthRange()`'s month-end) —
 * money must not look spent before its due date. The guard also advances only to
 * that clamped date, so the rest of the month is picked up on the day it's due.
 *
 * Per-rule isolation (M7-D): each stale rule is inserted and guard-advanced
 * independently. One rule that fails to insert (bad data, a constraint, RLS) does
 * not starve every other rule's materialization or block their guard advancement —
 * previously this ran as a single all-or-nothing batch across all rules.
 *
 * Returns whether any rows were inserted, so callers that run their transaction
 * reads concurrently with this know to refetch, plus a per-rule result list the
 * recurring page uses to show "last deducted / next due" or an error state.
 *
 * Runs through supabase-js with the user's session so RLS applies — never a
 * service-role/admin path.
 */
export async function materializeOccurrences(
  from: string,
  to: string,
): Promise<{ inserted: boolean; results: RuleMaterializeResult[] }> {
  const t0 = performance.now()
  const supabase = await createClient()
  const effectiveTo = clampToToday(to)

  // RLS scopes this to the current user's rules (empty when logged out).
  const { data: rules } = await supabase.from('recurring_rules').select('*')
  const stale = (rules ?? []).filter((r) => needsMaterialization(r.materialized_through, effectiveTo))
  if (stale.length === 0) {
    if (process.env.PERF_LOG) {
      console.log(`[perf] materialize no-op: ${(performance.now() - t0).toFixed(0)}ms (${rules?.length ?? 0} rules)`)
    }
    return { inserted: false, results: [] }
  }

  const user = await getUser()
  if (!user) return { inserted: false, results: [] }

  const staleIds = stale.map((r) => r.id)

  const [{ data: exceptions }, { data: existing }] = await Promise.all([
    supabase
      .from('recurring_exceptions')
      .select('rule_id, skipped_date')
      .in('rule_id', staleIds),
    supabase
      .from('transactions')
      .select('recurring_rule_id, occurrence_date')
      .eq('user_id', user.id)
      .not('recurring_rule_id', 'is', null)
      .gte('occurrence_date', from)
      .lte('occurrence_date', effectiveTo),
  ])

  const exByRule = new Map<string, string[]>()
  for (const ex of exceptions ?? []) {
    const arr = exByRule.get(ex.rule_id) ?? []
    arr.push(ex.skipped_date)
    exByRule.set(ex.rule_id, arr)
  }

  const existingKey = new Set(
    (existing ?? []).map((e) => `${e.recurring_rule_id}|${e.occurrence_date}`),
  )

  // Each rule is inserted and guard-advanced on its own — a poisoned rule's error
  // is caught and reported per-rule, never thrown across the whole batch. This
  // costs an extra small round-trip per stale rule vs. the old single-batch
  // insert, but stale rules are normally 0 (guard short-circuits above) or a
  // handful, so the perf trade-off (PERF-HANDOFF) is acceptable for correctness.
  const results: RuleMaterializeResult[] = []
  let anyInserted = false

  for (const rule of stale) {
    const dates = generateOccurrenceDates(
      {
        freq: rule.freq,
        interval: rule.interval,
        byWeekday: rule.by_weekday,
        startDate: rule.start_date,
        endDate: rule.end_date,
      },
      from,
      effectiveTo,
      exByRule.get(rule.id) ?? [],
    )

    const toInsert: TxInsert[] = []
    for (const d of dates) {
      if (existingKey.has(`${rule.id}|${d}`)) continue
      toInsert.push({
        user_id: user.id,
        type: rule.type,
        amount_satang: rule.amount_satang,
        account_id: rule.account_id,
        category: rule.category,
        // occurrence date at Bangkok midnight — keeps the row on the right calendar day
        datetime: `${d}T00:00:00+07:00`,
        recurring_rule_id: rule.id,
        occurrence_date: d,
      })
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('transactions').insert(toInsert)
      if (insertError) {
        // Leave materialized_through untouched so the next load retries this
        // rule's window; other rules are unaffected.
        console.error(`[recurrence] occurrence insert failed for rule ${rule.id}:`, insertError.message)
        results.push({ ruleId: rule.id, ok: false, error: insertError.message })
        continue
      }
      anyInserted = true
    }

    const { error: guardError } = await supabase
      .from('recurring_rules')
      .update({ materialized_through: effectiveTo })
      .eq('id', rule.id)
    if (guardError) {
      console.error(`[recurrence] guard update failed for rule ${rule.id}:`, guardError.message)
      results.push({ ruleId: rule.id, ok: false, error: guardError.message })
      continue
    }

    results.push({ ruleId: rule.id, ok: true })
  }

  if (process.env.PERF_LOG) {
    console.log(`[perf] materialize: ${(performance.now() - t0).toFixed(0)}ms (${stale.length} stale rules, inserted=${anyInserted})`)
  }
  return { inserted: anyInserted, results }
}
