'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createRefreshQueue } from '@/lib/realtime-refresh'

// Stable marker used by the production bundle regression check.
const CHANNEL_LABEL = 'm13-realtime-sync'
export default function RealtimeSync() {
  const router = useRouter()
  useEffect(() => {
    performance.mark(CHANNEL_LABEL)
    const db = createClient()
    let disposed = false, writes = 0, generation = 0
    let channel: ReturnType<typeof db.channel> | undefined
    let stopping: Promise<unknown> = Promise.resolve()
    const visible = () => document.visibilityState === 'visible' && navigator.onLine
    function editing() {
      return Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-busy="true"]')).some(el => !el.closest('[hidden],[aria-hidden="true"],[inert]') && el.getClientRects().length > 0)
        || !!document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,select,[contenteditable="true"]')
    }
    const queue = createRefreshQueue(() => router.refresh(), () => !visible() || writes > 0 || editing())
    // Next server actions and app API mutations use same-origin fetch. Count them
    // without changing their body/headers, including detached SPEC-5 optimistic writes.
    const originalFetch = window.fetch
    const trackedFetch: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href)
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const mutation = url.origin === location.origin && !['GET','HEAD','OPTIONS'].includes(method)
      if (mutation) writes++
      try {
        const response = await originalFetch.call(window, input, init)
        if (mutation) {
          // A server-action RSC response can stream after fetch resolves headers.
          // Observe its clone to keep the pending gate closed through the body,
          // while returning the untouched response to Next immediately.
          void response.clone().arrayBuffer().catch(() => {}).finally(() => { writes-- })
        }
        return response
      } catch (error) { if (mutation) writes--; throw error }
    }
    window.fetch = trackedFetch
    function stop() {
      generation++
      if (channel) { const old = channel; channel = undefined; stopping = db.removeChannel(old) }
    }
    async function start() {
      if (disposed || !visible() || channel) return
      const attempt = ++generation
      await stopping
      const { data: { user } } = await db.auth.getUser()
      const { data: { session } } = await db.auth.getSession()
      if (!user || !session || disposed || !visible() || attempt !== generation || channel) return
      await db.realtime.setAuth(session.access_token)
      if (disposed || !visible() || attempt !== generation) return
      channel = db.channel(`user:${user.id}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, () => queue.request())
      channel.subscribe(status => {
        if (disposed || attempt !== generation) return
        if (status === 'SUBSCRIBED') { performance.mark('m13-realtime-ready'); queue.request() }
      })
    }
    // A fresh/reconnected subscription reconciles once in SUBSCRIBED. Avoid
    // refreshing once on `online` and again when that handshake completes.
    const resume = () => { if (visible()) { if (channel) queue.request(); else void start() } else stop() }
    const online = () => { void start() }
    const offline = () => stop()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    void start()
    // No rendered elements and no guest mount: this component only invalidates.
    return () => {
      disposed = true; stop(); queue.dispose()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume); window.removeEventListener('online', online); window.removeEventListener('offline', offline)
      if (window.fetch === trackedFetch) window.fetch = originalFetch
    }
  }, [router])
  return null
}
