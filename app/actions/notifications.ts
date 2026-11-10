'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { notificationPrefsSchema } from '@/lib/notifications/prefs'

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
