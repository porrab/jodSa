'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { VISION_STORAGE } from '@/lib/slip/vision-preferences'

export function VisionSettings() {
  const t = useTranslations('vision')
  const ts = useTranslations('settings')
  const [key, setKey] = useState(''); const [enabled, setEnabled] = useState(false)
  const [ack, setAck] = useState(false); const [prompt, setPrompt] = useState(false); const [checked, setChecked] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { try { setKey(localStorage.getItem(VISION_STORAGE.key) ?? ''); const accepted = localStorage.getItem(VISION_STORAGE.ack) === 'true'; setAck(accepted); setEnabled(accepted && localStorage.getItem(VISION_STORAGE.enabled) === 'true') } catch { setError(true) } }, [])
  function enable(next: boolean) {
    if (next && !ack) { setPrompt(true); return }
    try { localStorage.setItem(VISION_STORAGE.enabled, String(next)); setEnabled(next) } catch { setError(true) }
  }
  function accept() {
    if (!checked) return
    try { localStorage.setItem(VISION_STORAGE.ack, 'true'); localStorage.setItem(VISION_STORAGE.enabled, 'true'); setAck(true); setEnabled(true); setPrompt(false) } catch { setError(true) }
  }
  function remove() { try { Object.values(VISION_STORAGE).forEach(name => localStorage.removeItem(name)); setKey(''); setEnabled(false); setAck(false); setChecked(false); setPrompt(false) } catch { setError(true) } }
  return <details data-testid="settings-vision" className="py-2">
    <summary className="min-h-11 cursor-pointer py-2"><span className="font-semibold">{t('summaryTitle')}</span><span className="ml-2 text-sm text-muted-foreground">{ts(enabled ? 'stateOn' : 'stateOff')}</span></summary>
    <section className="space-y-3 py-3" aria-labelledby="vision-title">
    <div><h2 id="vision-title" className="sr-only">{t('title')}</h2><p className="text-sm text-muted-foreground">{t('guidance')}</p></div>
    <p className="text-sm text-muted-foreground">{t('privacy')}</p>
    <Label htmlFor="vision-enabled" className="min-h-11"><Switch id="vision-enabled" checked={enabled} onCheckedChange={enable} />{t('enable')}</Label>
    {prompt && <div className="space-y-3 rounded-lg border border-border bg-card p-4"><Label htmlFor="vision-ack" className="min-h-11"><input id="vision-ack" type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />{t('ack')}</Label><Button type="button" disabled={!checked} onClick={accept}>{t('accept')}</Button></div>}
    {enabled && <Label className="flex min-w-0 flex-col items-stretch gap-2">{t('key')}<Input type="password" autoComplete="off" className="min-h-11 w-full" value={key} onChange={e => { setKey(e.target.value); try { localStorage.setItem(VISION_STORAGE.key, e.target.value) } catch { setError(true) } }} /></Label>}
    {(key || enabled) && <Button type="button" variant="outline" onClick={remove}>{t('remove')}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{t('storageError')}</p>}
  </section></details>
}
