import { toBaht } from '@/lib/money'

export const EXPORT_TYPES = ['income', 'expense', 'transfer', 'invest', 'divest'] as const
export type ExportType = typeof EXPORT_TYPES[number]

export type CsvTransaction = {
  datetime: string
  type: string
  account: string
  toAccount: string
  holding: string
  category: string
  counterparty: string
  amountSatang: number
  note: string
  refCode: string
  group: string
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/

function csvText(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function bangkokDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

export function bangkokRange(from: string, to: string): { from: string; toExclusive: string } {
  const next = new Date(`${to}T00:00:00+07:00`)
  next.setUTCDate(next.getUTCDate() + 1)
  return { from: new Date(`${from}T00:00:00+07:00`).toISOString(), toExclusive: next.toISOString() }
}

export function buildTransactionCsv(rows: CsvTransaction[]): string {
  const header = ['date', 'type', 'account', 'to_account', 'holding', 'category', 'counterparty', 'amount_baht', 'note', 'ref_code', 'group']
  const lines = rows.map((row) => [
    bangkokDateTime(row.datetime), row.type, row.account, row.toAccount, row.holding, row.category, row.counterparty,
    toBaht(row.amountSatang).toFixed(2), row.note, row.refCode, row.group,
  ].map(csvText).join(','))
  return `\uFEFF${header.join(',')}\r\n${lines.join('\r\n')}${lines.length ? '\r\n' : ''}`
}

export async function collectPages<T>(pageSize: number, fetchPage: (offset: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset)
    all.push(...page)
    if (page.length < pageSize) return all
  }
}
