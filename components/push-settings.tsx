'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { savePushSubscription, removePushSubscription } from '@/app/actions/notifications'

export function PushSettings() {
  const t = useTranslations('settings'); const [busy, setBusy] = useState(false); const [enabled, setEnabled] = useState(false)
  async function toggle() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setBusy(true); const registration = await navigator.serviceWorker.ready; const old = await registration.pushManager.getSubscription()
    if (old) { await old.unsubscribe(); await removePushSubscription(old.endpoint); setEnabled(false) }
    else { const permission = await Notification.requestPermission(); if (permission === 'granted') { const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; if (key) { const next = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); const result = await savePushSubscription(next.toJSON()); setEnabled(!result.error) } } }
    setBusy(false)
  }
  return <div className="space-y-2 py-4"><p className="font-semibold">{t('notifications')}</p><p className="text-sm text-muted-foreground">{t('notificationsIosCaveat')}</p><Button type="button" onClick={toggle} disabled={busy}>{enabled ? t('unsubscribe') : t('subscribe')}</Button></div>
}
