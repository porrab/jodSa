const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/

/**
 * Convert the Bangkok wall time emitted by `<input type="datetime-local">` to
 * an absolute instant. The control intentionally has no timezone; supplying
 * +07:00 here keeps the result independent of the server host timezone.
 */
export function investDatetimeToISO(value: string): string {
  if (!DATETIME_LOCAL_RE.test(value)) throw new Error('Invalid investment datetime')
  const withSeconds = value.length === 16 ? `${value}:00` : value
  const parsed = new Date(`${withSeconds}+07:00`)
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid investment datetime')
  return parsed.toISOString()
}
