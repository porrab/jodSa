// Visual-only required-field marker. Inputs already carry `required` /
// `aria-required`, so the asterisk is decorative (aria-hidden) — it must not be
// announced twice by screen readers.
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}
