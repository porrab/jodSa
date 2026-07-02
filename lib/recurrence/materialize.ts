import 'server-only'
import { createClient, getUser } from '@/lib/supabase/server'
import { generateOccurrenceDates } from './recurrence'
import { needsMaterialization } from './range'
import type { Database } from '@/lib/supabase/types'

type TxInsert = Database['public']['Tables']['transactions']['Insert']

/**
 * Lazy-on-read materialization. Given a [from, to] calendar-date window, create any
 * missing real transaction rows for every recurring rule the current user owns.
 *
 * Idempotent: rows already present (matched by recurring_rule_id + occurrence_date)
 * are skipped, and dates in recurring_exceptions are never regenerated. Safe to call
 * on every page load for the visible range.
 *
 * Cost guard: each rule carries `materialized_through` — the date its occurrences
 * are known to exist through. Rules already covering `to` are skipped, so the
 * common case (window unchanged since the last load) is a single small query.
 * Rule mutations reset the guard to NULL, which re-opens the window (idempotency
 * makes the re-run safe).
 *
 * Returns whether any rows were inserted, so callers that run their transaction
 * reads concurrently with this know to refetch. When nothing was inserted the
 * concurrent reads already saw the complete picture.
 *
 * Runs through supabase-js with the user's session so RLS applies — never a
 * service-role/admin path.
 */
export async function materializeOccurrences(
  from: string,
  to: string,
): Promise<{ inserted: boolean }> {
  const t0 = performance.now()
  const supabase = await createClient()

  // RLS scopes this to the current user's rules (empty when logged out).
  const { data: rules } = await supabase.from('recurring_rules').select('*')
  const stale = (rules ?? []).filter((r) => needsMaterialization(r.materialized_through, to))
  if (stale.length === 0) {
    if (process.env.PERF_LOG) {
      console.log(`[perf] materialize no-op: ${(performance.now() - t0).toFixed(0)}ms (${rules?.length ?? 0} rules)`)
    }
    return { inserted: false }
  }

  const user = await getUser()
  if (!user) return { inserted: false }

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
      .lte('occurrence_date', to),
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

  const toInsert: TxInsert[] = []
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
      to,
      exByRule.get(rule.id) ?? [],
    )
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
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('transactions').insert(toInsert)
    if (error) {
      // Leave materialized_through untouched so the next load retries the window.
      console.error('[recurrence] occurrence insert failed:', error.message)
      return { inserted: false }
    }
  }

  // Advance the guard only after the occurrences are safely in place.
  await supabase
    .from('recurring_rules')
    .update({ materialized_through: to })
    .in('id', staleIds)

  if (process.env.PERF_LOG) {
    console.log(`[perf] materialize: ${(performance.now() - t0).toFixed(0)}ms (${stale.length} stale rules, ${toInsert.length} inserted)`)
  }
  return { inserted: toInsert.length > 0 }
}
