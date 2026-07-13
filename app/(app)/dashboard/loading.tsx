// Route-level skeleton mirroring the current Home layout (design v3 — focal
// balance/budget line → quick-add → today's transactions) so the first
// server render streams behind a recognizable placeholder instead of the
// generic group fallback. No chart, no hero, no accounts list, no shortcuts
// grid — none of those exist on Home anymore (see app/(app)/dashboard/page.tsx).
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* focal total balance + one-line budget status */}
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-9 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-52 animate-pulse rounded bg-muted" />
      </div>

      {/* quick-add card */}
      <div className="h-28 animate-pulse rounded-xl bg-muted" />

      {/* today's transactions */}
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="rounded-lg border divide-y">
          <div className="h-14 animate-pulse bg-muted" />
          <div className="h-14 animate-pulse bg-muted" />
          <div className="h-14 animate-pulse bg-muted" />
        </div>
      </div>
    </div>
  )
}
