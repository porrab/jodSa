'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { notificationPrefsSchema } from '@/lib/notifications/prefs'
import * as webpush from 'web-push'
import { configureWebPush, pushFailure } from '@/lib/notifications/web-push'

export async function sendTestNotification() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const subscriptions = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('push_subscriptions').select('*').eq('user_id', user.id).order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    subscriptions.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  configureWebPush()
  const sensitive = subscriptions.flatMap(s => [s.endpoint, s.p256dh, s.auth, s.id, s.user_id])
  const results: { ok: boolean; statusCode: number | null; body: string }[] = []
  for (const sub of subscriptions) {
    try {
      const response = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: 'JodSa', body: 'JodSa test notification / แจ้งเตือนทดสอบ', url: '/settings' }))
      results.push({ ok: true, ...pushFailure(response, sensitive) })
    } catch (error) {
      const failure = pushFailure(error, sensitive)
      if ([404,410].includes(failure.statusCode ?? 0)) {
        const { error: cleanup } = await db.from('push_subscriptions').delete().eq('id', sub.id).eq('user_id', user.id)
        if (cleanup) throw new Error('Push subscription cleanup failed')
      }
      results.push({ ok: false, ...failure })
    }
  }
  return results
}

export async function saveNotificationPrefs(input: unknown) {
  const prefs = notificationPrefsSchema.parse(input)
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await db.from('user_settings').upsert({ user_id: user.id, notification_prefs: prefs })
  if (error) throw new Error(error.message)
}

const subscription = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) })
export async function savePushSubscription(input: unknown) {
  const parsed = subscription.safeParse(input); if (!parsed.success) return { error: 'Invalid subscription' }
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { error } = await supabase.rpc('claim_push_subscription', { p_endpoint: parsed.data.endpoint, p_p256dh: parsed.data.keys.p256dh, p_auth: parsed.data.keys.auth })
  return { error: error?.message ?? '' }
}
export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: 'Not authenticated' }
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
  return { error: error?.message ?? '' }
}
export async function confirmOccurrence(txId: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: 'Not authenticated' }
  const { error } = await supabase.from('transactions').select('id').eq('id', txId).eq('user_id', user.id).single()
  if (error) return { error: error.message }
  revalidatePath('/recurring'); revalidatePath('/transactions'); return { error: '' }
}
