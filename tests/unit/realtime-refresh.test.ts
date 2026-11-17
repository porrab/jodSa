import { afterEach, expect, it, vi } from 'vitest'
import { createRefreshQueue } from '@/lib/realtime-refresh'
afterEach(() => vi.useRealTimers())
it('coalesces transaction and account bursts into one refresh', () => {
  vi.useFakeTimers(); const refresh = vi.fn(); const q = createRefreshQueue(refresh, () => false)
  q.request(); vi.advanceTimersByTime(200); q.request(); q.request(); vi.advanceTimersByTime(499); expect(refresh).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(refresh).toHaveBeenCalledTimes(1); q.dispose()
})
it('queues one refresh until a mutation/form/visibility block clears', () => {
  vi.useFakeTimers(); let blocked = true; const refresh = vi.fn(); const q = createRefreshQueue(refresh, () => blocked)
  q.request(); q.request(); vi.advanceTimersByTime(3000); expect(refresh).not.toHaveBeenCalled(); blocked = false; vi.advanceTimersByTime(500); expect(refresh).toHaveBeenCalledTimes(1); vi.advanceTimersByTime(2000); expect(refresh).toHaveBeenCalledTimes(1); q.dispose()
})
it('drops timers on unmount', () => { vi.useFakeTimers(); const refresh = vi.fn(); const q = createRefreshQueue(refresh, () => false); q.request(); q.dispose(); vi.runAllTimers(); expect(refresh).not.toHaveBeenCalled() })
