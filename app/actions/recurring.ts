'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { recurringRuleSchema, type RecurringRuleInput } from '@/lib/validators/recurring'
import { parseInputToSatang } from '@/lib/money'

type ParseResult = { ok: true; data: RecurringRuleInput } | { ok: false; error: string }

function parseForm(formData: FormData): ParseResult {
  const amount_satang = parseInputToSatang((formData.get('amount') as string) ?? '')
  if (!amount_satang) return { ok: false, error: 'จำนวนเงินไม่ถูกต้อง' }

  const byWeekdayRaw = formData.getAll('by_weekday').map((v) => Number(v))
  const by_weekday = byWeekdayRaw.length ? byWeekdayRaw : undefined

  const parsed = recurringRuleSchema.safeParse({
    type: formData.get('type'),
    amount_satang,
    category: formData.get('category') || undefined,
    account_id: formData.get('account_id'),
    freq: formData.get('freq'),
    interval: Number(formData.get('interval') || 1),
    by_weekday,
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date') || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }
  return { ok: true, data: parsed.data }
}

export async function createRecurringRule(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const result = parseForm(formData)
  if (!result.ok) return { error: result.error }

  const { error } = await supabase
    .from('recurring_rules')
    .insert({ user_id: user.id, ...result.data })
  if (error) return { error: error.message }

  revalidatePath('/recurring')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  return { error: '' }
}

export async function updateRecurringRule(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const id = formData.get('id') as string
  const result = parseForm(formData)
  if (!result.ok) return { error: result.error }

  const { error } = await supabase
    .from('recurring_rules')
    .update(result.data)
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/recurring')
  return { error: '' }
}

export async function deleteRecurringRule(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  // Drop the rule's already-materialized occurrences too, so deleting a rule
  // doesn't leave orphan generated rows behind.
  await supabase.from('transactions').delete().eq('recurring_rule_id', id)
  const { error } = await supabase.from('recurring_rules').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/recurring')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
}

/**
 * Skip a single generated occurrence: delete the materialized transaction and
 * record an exception so lazy-on-read never recreates it.
 */
export async function skipOccurrence(ruleId: string, occurrenceDate: string, txId: string) {
  const supabase = await createClient()
  await supabase.from('transactions').delete().eq('id', txId)
  const { error } = await supabase
    .from('recurring_exceptions')
    .insert({ rule_id: ruleId, skipped_date: occurrenceDate })
  if (error && error.code !== '23505') throw new Error(error.message)
  revalidatePath('/recurring')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
}
