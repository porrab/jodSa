// Route-level skeleton for the v6 Home contract: hero → budget band → today.
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[755px] flex-col" aria-busy="true" aria-live="polite">
      <div className="h-[324px] px-5 pb-2 pt-4">
        <div className="h-full space-y-3 rounded-[20px] bg-hero p-5">
          <div className="h-4 w-36 animate-pulse rounded bg-hero-inset" />
          <div className="h-11 w-52 animate-pulse rounded bg-hero-inset" />
          <div className="h-2 w-full animate-pulse rounded bg-hero-inset" />
          <div className="h-14 w-full animate-pulse rounded bg-hero-inset" />
          <div className="h-14 w-full animate-pulse rounded bg-hero-inset" />
        </div>
      </div>

      <div className="h-[150px] border-y border-border px-5 py-4">
        <div className="h-full animate-pulse bg-muted" />
      </div>

      <div className="min-h-[281px] flex-1 px-5 pb-6 pt-4">
        <div className="h-6 w-36 animate-pulse rounded bg-muted" />
        <div className="mt-2 divide-y divide-border">
          <div className="h-[76px] animate-pulse bg-muted" />
          <div className="h-[76px] animate-pulse bg-muted" />
          <div className="h-[76px] animate-pulse bg-muted" />
        </div>
      </div>
    </div>
  )
}
