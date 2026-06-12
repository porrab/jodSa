// Sliding-window in-memory rate limiter for the guest slip POST.
// In-memory = per-server-instance; on Vercel each lambda instance has its own
// window, so the effective global limit is (limit × instances). Acceptable for
// MVP spam protection — a durable store (Upstash/Redis) is the Phase-2 upgrade.

type Window = { timestamps: number[] }

const DEFAULT_LIMIT = 10
const DEFAULT_WINDOW_MS = 60_000
const MAX_KEYS = 10_000

export function createRateLimiter(
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
) {
  const windows = new Map<string, Window>()

  return function check(key: string, now = Date.now()): boolean {
    let w = windows.get(key)
    if (!w) {
      // crude memory cap: reset everything rather than grow unbounded
      if (windows.size >= MAX_KEYS) windows.clear()
      w = { timestamps: [] }
      windows.set(key, w)
    }
    w.timestamps = w.timestamps.filter((t) => now - t < windowMs)
    if (w.timestamps.length >= limit) return false
    w.timestamps.push(now)
    return true
  }
}
