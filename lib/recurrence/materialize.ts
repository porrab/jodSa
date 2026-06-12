import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { generateOccurrenceDates } from './recurrence'
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
 * Runs through supabase-js with the user's session so RLS applies — never a
 * service-role/admin path.
 */
export async function materializeOccurrences(from: string, to: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: rules } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('user_id', user.id)
  if (!rules || rules.length === 0) return

  const ruleIds = rules.map((r) => r.id)

  const [{ data: exceptions }, { data: existing }] = await Promise.all([
    supabase
      .from('recurring_exceptions')
      .select('rule_id, skipped_date')
      .in('rule_id', ruleIds),
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
  for (const rule of rules) {
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
    await supabase.from('transactions').insert(toInsert)
  }
}
