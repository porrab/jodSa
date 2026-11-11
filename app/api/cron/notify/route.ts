import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import * as webpush from 'web-push'
import { createCronClient } from './supabase'
import { defaultNotificationPrefs, isQuietHour, notificationPrefsSchema } from '@/lib/notifications/prefs'
import { generateOccurrenceDates } from '@/lib/recurrence/recurrence'
import { notificationSlot } from '@/lib/notifications/slot'
import { configureWebPush, pushFailure } from '@/lib/notifications/web-push'
export const runtime = 'nodejs'
async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += 500) { const { data, error } = await read(from, from + 499); if (error) throw new Error(error.message); all.push(...(data ?? [])); if (!data || data.length < 500) return all }
}
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const digest = (s: string) => createHash('sha256').update(s).digest()
  if (!secret || !timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const slot = notificationSlot(new Date())
  if (!slot) return NextResponse.json({ sent: 0, slot: null })
  const db = createCronClient()
  const [subscriptions, settings, users, rules, exceptions] = await Promise.all([
    pages((a,b) => db.from('push_subscriptions').select('*').order('id').range(a,b)),
    pages((a,b) => db.from('user_settings').select('*').order('user_id').range(a,b)),
    pages((a,b) => db.from('users').select('id,locale').order('id').range(a,b)),
    pages((a,b) => db.from('recurring_rules').select('*').order('id').range(a,b)),
    pages((a,b) => db.from('recurring_exceptions').select('*').order('id').range(a,b)),
  ])
  configureWebPush()
  const diagnostics = { slot: slot.boundary, users: new Set(subscriptions.map(s => s.user_id)).size, devices: subscriptions.length, claimed: 0, sent: 0, failed: [] as ReturnType<typeof pushFailure>[], skipped: { quiet: 0, dailyOff: 0, recurringOff: 0, alreadyClaimed: 0 } }
  for (const userId of new Set(subscriptions.map(s => s.user_id))) {
    const prefs = notificationPrefsSchema.catch(defaultNotificationPrefs).parse(settings.find(s => s.user_id === userId)?.notification_prefs)
    if (isQuietHour(prefs, slot.time)) { diagnostics.skipped.quiet++; continue }
    if (!prefs.daily) diagnostics.skipped.dailyOff++
    if (!prefs.recurring) diagnostics.skipped.recurringOff++
    const en = users.find(u => u.id === userId)?.locale === 'en'
    const messages: { type: string; rule_id?: string; occurrence_date?: string; slot_at?: string; body: string; url: string }[] = []
    if (prefs.daily) messages.push({ type: 'daily', slot_at: slot.boundary, body: en ? 'Have you logged today?' : 'บันทึกรายการวันนี้หรือยัง?', url: '/dashboard' })
    if (prefs.recurring) for (const r of rules.filter(r => r.user_id === userId)) {
      if (!generateOccurrenceDates({ freq: r.freq, interval: r.interval, byWeekday: r.by_weekday, startDate: r.start_date, endDate: r.end_date }, slot.day, slot.day, exceptions.filter(e => e.rule_id === r.id).map(e => e.skipped_date)).length) continue
      messages.push({ type: 'recurring', rule_id: r.id, occurrence_date: slot.day, body: en ? 'Have you paid yet?' : 'จ่ายยัง?', url: `/recurring/confirm?rule=${r.id}&date=${slot.day}` })
    }
    for (const { body, url, ...delivery } of messages) {
      const { data: claim, error } = await db.from('push_deliveries').insert({ user_id: userId, ...delivery }).select('id').single()
      if (error) { if (error.code === '23505') { diagnostics.skipped.alreadyClaimed++; continue }; throw new Error(error.message) }
      diagnostics.claimed++
      let delivered = false
      for (const sub of subscriptions.filter(s => s.user_id === userId)) {
        try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: 'JodSa', body, url })); delivered = true; diagnostics.sent++ }
        catch (error: unknown) {
          const failure = pushFailure(error, subscriptions.flatMap(s => [s.endpoint, s.p256dh, s.auth, s.user_id, s.id]))
          diagnostics.failed.push(failure)
          console.error('Push delivery failed', { ...diagnostics, failed: [failure] })
          if ([404,410].includes(failure.statusCode ?? 0)) { const { error: cleanup } = await db.from('push_subscriptions').delete().eq('id', sub.id); if (cleanup) throw new Error('Push subscription cleanup failed') }
        }
      }
      if (!delivered && claim) await db.from('push_deliveries').delete().eq('id', claim.id)
    }
  }
  return NextResponse.json(diagnostics)
}
