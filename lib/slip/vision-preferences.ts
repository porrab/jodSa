import 'client-only'
export const VISION_STORAGE = { key: 'jodsa:vision:key', enabled: 'jodsa:vision:enabled', ack: 'jodsa:vision:ack' } as const
export function readVisionKey(): string | null {
  try { return localStorage.getItem(VISION_STORAGE.enabled) === 'true' && localStorage.getItem(VISION_STORAGE.ack) === 'true' ? localStorage.getItem(VISION_STORAGE.key) : null } catch { return null }
}
