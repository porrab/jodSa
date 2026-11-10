import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import webpush from 'web-push'
import { createCronClient } from './supabase'
import { defaultNotificationPrefs, isQuietHour, notificationPrefsSchema } from '@/lib/notifications/prefs'

export const runtime = 'nodejs'
function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y) }
function bangkok(now: Date) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); const p = Object.fromEntries(parts.map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` } }
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? ''; const auth = request.headers.get('authorization') ?? ''
  if (!secret || !equal(auth, `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const now = new Date(), local = bangkok(now), slot = local.time.startsWith('12:') || local.time.startsWith('22:')
  if (!slot) return NextResponse.json({ sent: 0, reason: 'outside-slot' })
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
  const db = createCronClient() as any; const [{ data: subscriptions }, { data: settings }] = await Promise.all([db.from('push_subscriptions').select('*'), db.from('user_settings').select('*')])
  let sent = 0
  for (const sub of subscriptions ?? []) {
    const prefs = notificationPrefsSchema.catch(defaultNotificationPrefs).parse(settings?.find((s: any) => s.user_id === sub.user_id)?.notification_prefs)
    if (!prefs.daily || isQuietHour(prefs, local.time)) continue
    const { error } = await db.from('push_deliveries').insert({ user_id: sub.user_id, type: 'daily', slot_at: now.toISOString() })
    if (error) continue
    try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: 'JodSa', body: 'บันทึกรายการวันนี้หรือยัง?', url: '/dashboard' })); sent++ }
    catch (error: any) { await db.from('push_deliveries').delete().eq('user_id', sub.user_id).eq('type', 'daily').eq('slot_at', now.toISOString()); if ([404, 410].includes(error?.statusCode)) await db.from('push_subscriptions').delete().eq('id', sub.id) }
  }
  const { data: due } = await db.from('transactions').select('id,user_id,occurrence_date').not('recurring_rule_id', 'is', null).eq('occurrence_date', local.day)
  for (const occurrence of due ?? []) {
    const prefs = notificationPrefsSchema.catch(defaultNotificationPrefs).parse(settings?.find((s: any) => s.user_id === occurrence.user_id)?.notification_prefs)
    if (!prefs.recurring || isQuietHour(prefs, local.time)) continue
    const { error } = await db.from('push_deliveries').insert({ user_id: occurrence.user_id, type: 'recurring', occurrence_id: occurrence.id })
    if (error) continue
    for (const sub of (subscriptions ?? []).filter((s: any) => s.user_id === occurrence.user_id)) {
      try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: 'JodSa', body: 'จ่ายยัง?', url: `/recurring/confirm?occ=${occurrence.id}` })); sent++ }
      catch (error: any) { if ([404, 410].includes(error?.statusCode)) await db.from('push_subscriptions').delete().eq('id', sub.id) }
    }
  }
  return NextResponse.json({ sent })
}
