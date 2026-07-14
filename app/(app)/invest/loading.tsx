export default function InvestLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="rounded-lg border divide-y">
        <div className="h-16 animate-pulse bg-muted" />
        <div className="h-16 animate-pulse bg-muted" />
        <div className="h-16 animate-pulse bg-muted" />
      </div>
    </div>
  )
}
