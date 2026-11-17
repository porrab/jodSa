/** Server renders remain authoritative. Keep at most one pending refresh. */
export function createRefreshQueue(refresh: () => void, blocked: () => boolean, delay = 500) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = false
  let disposed = false
  function schedule() {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, delay)
  }
  function flush() {
    timer = undefined
    if (!pending || disposed) return
    if (blocked()) { schedule(); return }
    pending = false
    refresh()
  }
  return {
    request() { pending = true; schedule() },
    dispose() { disposed = true; pending = false; if (timer) clearTimeout(timer) },
  }
}
