// Route-level skeleton mirroring the transactions page (title → toolbar →
// transaction rows) shown while the first server render is in flight.
export default function TransactionsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      {/* add/filter toolbar */}
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
      {/* list rows */}
      <div className="divide-y rounded-xl border bg-card">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center justify-between p-3">
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
