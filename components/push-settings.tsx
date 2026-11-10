'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { savePushSubscription, removePushSubscription, saveNotificationPrefs } from '@/app/actions/notifications'
import { createClient } from '@/lib/supabase/client'
import { defaultNotificationPrefs, notificationPrefsSchema } from '@/lib/notifications/prefs'
export function PushSettings() {
  const t = useTranslations('settings'); const [busy, setBusy] = useState(false); const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState(''); const [prefs, setPrefs] = useState(defaultNotificationPrefs)
  useEffect(() => { void (async () => {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) { const registration = await navigator.serviceWorker.ready; setEnabled(!!await registration.pushManager.getSubscription()) }
      const db = createClient(); const { data: { user } } = await db.auth.getUser()
      if (user) { const { data } = await db.from('user_settings').select('notification_prefs').eq('user_id', user.id).maybeSingle(); if (data) setPrefs(notificationPrefsSchema.parse(data.notification_prefs)) }
    } catch { setMessage(t('notificationError')) }
  })() }, [t])
  async function toggle() {
    setBusy(true); setMessage('')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Unsupported')
      const registration = await navigator.serviceWorker.ready; const old = await registration.pushManager.getSubscription()
      if (old) { const result = await removePushSubscription(old.endpoint); if (result.error) throw new Error(result.error); await old.unsubscribe(); setEnabled(false) }
      else {
        if (await Notification.requestPermission() !== 'granted') { setMessage(t('notificationDenied')); return }
        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; if (!key) throw new Error('Missing VAPID key')
        const next = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
        const result = await savePushSubscription(next.toJSON()); if (result.error) { await next.unsubscribe(); throw new Error(result.error) }; setEnabled(true)
      }
    } catch { setMessage(t('notificationError')) } finally { setBusy(false) }
  }
  async function save() { setBusy(true); try { await saveNotificationPrefs(prefs); setMessage(t('notificationSaved')) } catch { setMessage(t('notificationError')) } finally { setBusy(false) } }
  return <section className="space-y-3 py-4"><h2 className="font-semibold">{t('notifications')}</h2><p className="text-sm text-muted-foreground">{t('notificationsIosCaveat')}</p>
    <Button type="button" onClick={toggle} disabled={busy}>{enabled ? t('unsubscribe') : t('subscribe')}</Button>
    {(['daily', 'recurring'] as const).map(type => <label key={type} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={prefs[type]} onChange={e => setPrefs({ ...prefs, [type]: e.target.checked })} />{t(type === 'daily' ? 'notificationDaily' : 'notificationRecurring')}</label>)}
    {(['quietStart','quietEnd'] as const).map(field => <label key={field} className="flex flex-col gap-2">{t(field)}<input className="min-h-11 rounded-md border border-input bg-background px-3" type="time" value={prefs[field] ?? ''} onChange={e => setPrefs({ ...prefs, [field]: e.target.value || null })} /></label>)}
    <Button type="button" disabled={busy} onClick={save}>{t('notificationSave')}</Button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>
}
