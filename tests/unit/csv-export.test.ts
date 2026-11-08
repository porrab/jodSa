import { describe, expect, it } from 'vitest'
import { buildTransactionCsv, bangkokRange, collectPages } from '@/lib/csv-export'

describe('CSV export', () => {
  it('writes a BOM, RFC 4180 text, formula-safe cells, and satang as baht', () => {
    const csv = buildTransactionCsv([{
      datetime: '2026-11-08T16:59:00.000Z', type: 'transfer', account: 'บัญชี,หลัก', toAccount: 'Savings', holding: '',
      category: '', counterparty: '=SUM(A1:A2)', amountSatang: 12345, note: 'ชื่อ "ใหม่"\nบรรทัดสอง', refCode: 'ref', group: 'ทริป',
    }])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('2026-11-08 23:59,transfer,"บัญชี,หลัก",Savings,,,\'=SUM(A1:A2),123.45,"ชื่อ ""ใหม่""\nบรรทัดสอง",ref,ทริป')
  })

  it('keeps investment holdings and Bangkok date boundaries exact', () => {
    const range = bangkokRange('2026-11-08', '2026-11-08')
    expect(range).toEqual({ from: '2026-11-07T17:00:00.000Z', toExclusive: '2026-11-08T17:00:00.000Z' })
    const csv = buildTransactionCsv([{ datetime: '2026-11-08T17:01:00.000Z', type: 'invest', account: 'KBank', toAccount: '', holding: 'PTT', category: '', counterparty: 'ผู้ขาย', amountSatang: 10000, note: '', refCode: '', group: '' }])
    expect(csv).toContain('2026-11-09 00:01,invest,KBank,,PTT,,ผู้ขาย,100.00,,,')
  })

  it('collects every page when the first result reaches the page size', async () => {
    const calls: number[] = []
    const rows = await collectPages(2, async (offset) => {
      calls.push(offset)
      return offset === 0 ? ['a', 'b'] : offset === 2 ? ['c'] : []
    })
    expect(rows).toEqual(['a', 'b', 'c'])
    expect(calls).toEqual([0, 2])
  })
})
