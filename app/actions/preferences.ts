'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LOCALES, type Locale } from '@/i18n/request'

export async function setLocale(locale: string) {
  if (!LOCALES.includes(locale as Locale)) throw new Error('Unsupported locale')

  const store = await cookies()
  store.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  // Persist on the profile too so a fresh device can restore it later.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('users').update({ locale }).eq('id', user.id)
  }

  revalidatePath('/', 'layout')
}

/**
 * Delete the caller's own account. Identity comes from the session; the admin
 * client is needed only because Supabase has no self-service auth.users delete.
 * FK chain auth.users → public.users → every table is ON DELETE CASCADE, so a
 * single deleteUser wipes all rows. Storage doesn't cascade — clean it first.
 */
export async function deleteOwnAccount(): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: objects } = await admin.storage.from('bank-qr').list(user.id)
  if (objects && objects.length > 0) {
    await admin.storage
      .from('bank-qr')
      .remove(objects.map((o) => `${user.id}/${o.name}`))
  }

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return { error: error.message }
  return { error: '' }
}
