// Route-level skeleton mirroring the dashboard layout (hero → quick-add →
// accounts → budgets → chart) so the first server render streams behind a
// recognizable placeholder instead of the generic group fallback.
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* hero balance card */}
      <div className="h-36 animate-pulse rounded-2xl bg-muted" />
      {/* quick-add card */}
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      {/* mobile shortcuts row */}
      <div className="grid grid-cols-4 gap-3 md:hidden">
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      </div>
      {/* accounts list */}
      <div className="space-y-3">
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
      {/* budgets */}
      <div className="space-y-3">
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        <div className="h-36 animate-pulse rounded-xl bg-muted" />
      </div>
      {/* 6-month chart */}
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-56 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}
