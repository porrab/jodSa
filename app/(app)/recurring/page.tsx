import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import { computeNextDue } from '@/lib/recurrence/status'
import RecurringClient, { type RuleStatus } from '@/components/recurring-form'

export default async function RecurringPage() {
  const t = await getTranslations('recurring')
  const supabase = await createClient()

  // Lazy-on-read materialization runs here too (J7): visiting this page is how
  // the user finds out whether a rule actually deducted, so it must attempt the
  // same materialization dashboard/transactions do, not just display stale state.
  const { from, to } = currentMonthRange()
  const [{ data: rules }, { data: accounts }, mat] = await Promise.all([
    supabase.from('recurring_rules').select('*').order('start_date', { ascending: false }),
    supabase.from('accounts').select('id, name, bank').order('created_at'),
    materializeOccurrences(from, to),
  ])

  const ruleIds = (rules ?? []).map((r) => r.id)

  // Last-deducted date per rule: the most recent materialized occurrence, across
  // all time — a monthly/yearly rule's last hit may sit in an earlier month than
  // the current materialization window.
  const { data: occurrences } = ruleIds.length
    ? await supabase
        .from('transactions')
        .select('recurring_rule_id, occurrence_date')
        .in('recurring_rule_id', ruleIds)
        .not('occurrence_date', 'is', null)
        .order('occurrence_date', { ascending: false })
    : { data: [] as { recurring_rule_id: string | null; occurrence_date: string | null }[] }

  const lastDeductedByRule = new Map<string, string>()
  for (const row of occurrences ?? []) {
    if (row.recurring_rule_id && row.occurrence_date && !lastDeductedByRule.has(row.recurring_rule_id)) {
      lastDeductedByRule.set(row.recurring_rule_id, row.occurrence_date)
    }
  }

  // Skip-exceptions feed the next-due calculation the same way materialization does.
  const { data: exceptions } = ruleIds.length
    ? await supabase.from('recurring_exceptions').select('rule_id, skipped_date').in('rule_id', ruleIds)
    : { data: [] as { rule_id: string; skipped_date: string }[] }
  const exByRule = new Map<string, string[]>()
  for (const ex of exceptions ?? []) {
    const arr = exByRule.get(ex.rule_id) ?? []
    arr.push(ex.skipped_date)
    exByRule.set(ex.rule_id, arr)
  }

  const errorByRule = new Map(mat.results.filter((r) => !r.ok).map((r) => [r.ruleId, r.error ?? '']))

  const status: Record<string, RuleStatus> = {}
  for (const rule of rules ?? []) {
    status[rule.id] = {
      lastDeducted: lastDeductedByRule.get(rule.id) ?? null,
      nextDue: computeNextDue(
        {
          freq: rule.freq,
          interval: rule.interval,
          byWeekday: rule.by_weekday,
          startDate: rule.start_date,
          endDate: rule.end_date,
        },
        exByRule.get(rule.id) ?? [],
      ),
      error: errorByRule.get(rule.id) ?? null,
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <RecurringClient rules={rules ?? []} accounts={accounts ?? []} status={status} />
    </div>
  )
}
