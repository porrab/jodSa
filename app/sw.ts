import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'
import { SHARE_CACHE, SHARED_SLIP_URL } from '@/lib/share-target'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Web Share Target (Android): the manifest POSTs the shared image here. The SW
// stashes it in the Cache API (never the network — images must not leave the
// device) and redirects to /import, which picks it up and parses on-device.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/import/share-target') return
  event.respondWith(
    (async () => {
      try {
        const formData = await event.request.formData()
        const file = formData.get('slip')
        if (file instanceof File && file.type.startsWith('image/')) {
          const cache = await caches.open(SHARE_CACHE)
          await cache.put(
            SHARED_SLIP_URL,
            new Response(file, {
              headers: {
                'Content-Type': file.type,
                'X-File-Name': encodeURIComponent(file.name || 'shared-slip'),
              },
            }),
          )
        }
      } catch {
        // fall through — /import still renders its normal picker
      }
      return Response.redirect(new URL('/import', self.location.origin).href, 303)
    })(),
  )
})

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()
