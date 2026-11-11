'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { savePushSubscription, removePushSubscription, saveNotificationPrefs, sendTestNotification } from '@/app/actions/notifications'
import { createClient } from '@/lib/supabase/client'
import { defaultNotificationPrefs, notificationPrefsSchema } from '@/lib/notifications/prefs'
export function PushSettings() {
  const t = useTranslations('settings'); const [busy, setBusy] = useState(false); const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState(''); const [prefs, setPrefs] = useState(defaultNotificationPrefs)
  const [testResults, setTestResults] = useState<Awaited<ReturnType<typeof sendTestNotification>> | null>(null)
  useEffect(() => { void (async () => {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) { const registration = await navigator.serviceWorker.ready; setEnabled(!!await registration.pushManager.getSubscription()) }
      const db = createClient(); const { data: { user } } = await db.auth.getUser()
      if (user) { const { data } = await db.from('user_settings').select('notification_prefs').eq('user_id', user.id).maybeSingle(); if (data) setPrefs(notificationPrefsSchema.parse(data.notification_prefs)) }
    } catch (error) { setMessage(t('notificationSaveFailed', { error: error instanceof Error ? error.message : 'Unknown' })) }
  })() }, [t])
  async function toggle() {
    setBusy(true); setMessage('')
    try {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (ios && !window.matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone) { setMessage(t('notificationNotInstalled')); return }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setMessage(t('notificationUnsupported')); return }
      const registration = await navigator.serviceWorker.ready; const old = await registration.pushManager.getSubscription()
      if (old) { const result = await removePushSubscription(old.endpoint); if (result.error) { setMessage(t('notificationSaveFailed', { error: result.error })); return }; await old.unsubscribe(); setEnabled(false) }
      else {
        if (await Notification.requestPermission() !== 'granted') { setMessage(t('notificationDenied')); return }
        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; if (!key) { setMessage(t('notificationMissingKey')); return }
        const next = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
        try {
          const result = await savePushSubscription(next.toJSON())
          if (result.error) throw new Error(result.error)
          setEnabled(true)
        } catch (error) { await next.unsubscribe(); setMessage(t('notificationSaveFailed', { error: error instanceof Error ? error.message : 'Unknown' })) }
      }
    } catch (error) { setMessage(t('notificationSubscribeFailed', { name: error instanceof Error ? error.name : 'Unknown' })) } finally { setBusy(false) }
  }
  async function save() { setBusy(true); try { await saveNotificationPrefs(prefs); setMessage(t('notificationSaved')) } catch (error) { setMessage(t('notificationSaveFailed', { error: error instanceof Error ? error.message : 'Unknown' })) } finally { setBusy(false) } }
  async function sendTest() { setBusy(true); setTestResults(null); try { setTestResults(await sendTestNotification()) } catch (error) { setMessage(t('notificationTestFailed', { error: error instanceof Error ? error.message : 'Unknown' })) } finally { setBusy(false) } }
  return <section className="space-y-3 py-4" aria-labelledby="push-settings-title"><div><h2 id="push-settings-title" className="font-semibold">{t('notifications')}</h2><p className="text-sm text-muted-foreground">{t('notificationsIosCaveat')}</p></div>
    <Button type="button" onClick={toggle} disabled={busy}>{enabled ? t('unsubscribe') : t('subscribe')}</Button>
    <Button type="button" variant="outline" onClick={sendTest} disabled={busy || !enabled}>{t('notificationTest')}</Button>
    {testResults && <pre role="status" className="whitespace-pre-wrap break-all text-sm">{JSON.stringify(testResults, null, 2)}</pre>}
    {(['daily', 'recurring'] as const).map(type => <Label key={type} htmlFor={`push-${type}`} className="flex min-h-11 cursor-pointer items-center gap-3"><Switch id={`push-${type}`} checked={prefs[type]} onCheckedChange={checked => setPrefs({ ...prefs, [type]: checked })} />{t(type === 'daily' ? 'notificationDaily' : 'notificationRecurring')}</Label>)}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(['quietStart','quietEnd'] as const).map(field => <Label key={field} className="flex min-w-0 flex-col items-stretch gap-2">{t(field)}<Input className="min-h-11 w-full" type="time" value={prefs[field] ?? ''} onChange={e => setPrefs({ ...prefs, [field]: e.target.value || null })} /></Label>)}
    </div>
    <Button type="button" disabled={busy} onClick={save}>{t('notificationSave')}</Button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>
}
