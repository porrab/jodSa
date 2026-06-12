// Asia/Bangkok calendar-date helpers for lazy materialization windows.

function bangkokParts(d = new Date()): { y: number; m: number; day: number } {
  // en-CA formats as YYYY-MM-DD, so we get the Bangkok calendar date directly.
  const s = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const [y, m, day] = s.split('-').map(Number)
  return { y, m, day }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Current month [first, last] as YYYY-MM-DD strings in Asia/Bangkok. */
export function currentMonthRange(d = new Date()): { from: string; to: string } {
  const { y, m } = bangkokParts(d)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last day of this month
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay)}` }
}
