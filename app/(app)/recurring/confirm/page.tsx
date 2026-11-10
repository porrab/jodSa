import { confirmOccurrence } from '@/app/actions/notifications'
import { skipOccurrence } from '@/app/actions/recurring'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { formatTHB } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { notFound } from 'next/navigation'
export default async function ConfirmRecurringPage({ searchParams }: { searchParams: Promise<{ rule?: string; date?: string }> }) {
  const { rule, date } = await searchParams
  if (!rule || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()
  const db = await createClient(); const t = await getTranslations('settings')
  const { data: record } = await db.from('recurring_rules').select('*').eq('id', rule).single()
  if (!record) notFound()
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0,10)
  if (date > today) notFound()
  await materializeOccurrences(date, today)
  const { data: tx } = await db.from('transactions').select('id').eq('recurring_rule_id', rule).eq('occurrence_date', date).maybeSingle()
  const { data: account } = await db.from('accounts').select('name').eq('id', record.account_id).single()
  async function confirm() { 'use server'; if (tx) { const result = await confirmOccurrence(tx.id); if (result.error) throw new Error(result.error) } }
  async function skip() { 'use server'; await skipOccurrence(record!.id, date!, tx?.id ?? '') }
  return <section className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground"><h1 className="text-2xl font-bold">{record.category ?? t('notificationRecurring')}</h1><p>{formatTHB(record.amount_satang)} · {account?.name} · {date}</p><form action={confirm}><Button className="min-h-11" type="submit">{t('confirmPayment')}</Button></form><form action={skip}><Button className="min-h-11" variant="outline" type="submit">{t('skipPayment')}</Button></form></section>
}
