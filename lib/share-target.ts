// Shared between app/sw.ts (writer) and the /import client (reader).
export const SHARE_CACHE = 'jodsa-share-target'
export const SHARED_SLIP_URL = '/__shared-slip'

/** Pop the slip stashed by the SW share-target handler, if any (one-shot). */
export async function takeSharedSlip(): Promise<File | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(SHARE_CACHE)
    const res = await cache.match(SHARED_SLIP_URL)
    if (!res) return null
    await cache.delete(SHARED_SLIP_URL)
    const blob = await res.blob()
    const name = decodeURIComponent(res.headers.get('X-File-Name') ?? 'shared-slip')
    return new File([blob], name, { type: blob.type })
  } catch {
    return null
  }
}
