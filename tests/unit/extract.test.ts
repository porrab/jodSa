import { describe, it, expect } from 'vitest'
import {
  extractAmount,
  extractDateTime,
  extractCounterparty,
  inferBankCode,
  extractRefCodeFromQR,
  extractFields,
} from '@/lib/slip/extract'

// ─── amount ──────────────────────────────────────────────────────────────────

describe('extractAmount', () => {
  it('parses จำนวนเงิน label (SCB style)', () => {
    const r = extractAmount('จำนวนเงิน 1,234.56 บาท')
    expect(r.value).toBe(123456)
    expect(r.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('parses จำนวน label (KBank style)', () => {
    const r = extractAmount('จำนวน 500.00')
    expect(r.value).toBe(50000)
    expect(r.confidence).toBeGreaterThanOrEqual(0.88)
  })

  it('parses Amount label (BBL/English)', () => {
    const r = extractAmount('Amount 2,000.00 THB')
    expect(r.value).toBe(200000)
    expect(r.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('parses ฿ prefix', () => {
    const r = extractAmount('฿ 350.50')
    expect(r.value).toBe(35050)
  })

  it('parses suffix บาท', () => {
    const r = extractAmount('750.00 บาท')
    expect(r.value).toBe(75000)
  })

  it('normalizes Thai digits ๕๐๐.๐๐', () => {
    const r = extractAmount('จำนวน ๕๐๐.๐๐')
    expect(r.value).toBe(50000)
  })

  it('converts 2-decimal baht string to satang (1.50 → 150)', () => {
    const r = extractAmount('จำนวน 1.50')
    expect(r.value).toBe(150)
  })

  it('returns null when no amount found', () => {
    const r = extractAmount('ธนาคารไทยพาณิชย์ โอนเงิน')
    expect(r.value).toBeNull()
    expect(r.confidence).toBe(0)
  })
})

// ─── datetime ────────────────────────────────────────────────────────────────

describe('extractDateTime', () => {
  it('parses dd/MM/yy HH:mm (KBank style)', () => {
    const r = extractDateTime('15/05/67 14:30')
    expect(r.value).toMatch(/^2024-05-15T14:30:00\+07:00$/)
    expect(r.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('parses dd/MM/yyyy HH:mm', () => {
    const r = extractDateTime('05/12/2024 09:15')
    expect(r.value).toMatch(/^2024-12-05T09:15:00\+07:00$/)
  })

  it('parses Thai month abbreviation (SCB style)', () => {
    const r = extractDateTime('15 พ.ค. 2567 14:30')
    expect(r.value).toMatch(/^2024-05-15T14:30:00\+07:00$/)
    expect(r.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('converts Buddhist year (พ.ศ.) to Gregorian', () => {
    const r = extractDateTime('01 ม.ค. 2568 00:00')
    expect(r.value).toMatch(/^2025-01-01T00:00:00\+07:00$/)
  })

  it('parses dd-MM-yyyy HH:mm (BBL style)', () => {
    const r = extractDateTime('20-06-2024 10:00')
    expect(r.value).toMatch(/^2024-06-20T10:00:00\+07:00$/)
  })

  it('returns null for unparsable text', () => {
    const r = extractDateTime('ไม่มีวันที่')
    expect(r.value).toBeNull()
    expect(r.confidence).toBe(0)
  })
})

// ─── counterparty ────────────────────────────────────────────────────────────

describe('extractCounterparty', () => {
  it('extracts ผู้รับ label', () => {
    const r = extractCounterparty('ผู้รับ: สมชาย ใจดี')
    expect(r.value).toContain('สมชาย')
    expect(r.confidence).toBeGreaterThanOrEqual(0.75)
  })

  it('extracts Recipient label', () => {
    const r = extractCounterparty('Recipient: John Smith')
    expect(r.value).toContain('John Smith')
  })

  it('returns null when no counterparty pattern found', () => {
    const r = extractCounterparty('จำนวนเงิน 100.00 บาท')
    expect(r.value).toBeNull()
  })
})

// ─── bankCode ────────────────────────────────────────────────────────────────

describe('inferBankCode', () => {
  it.each([
    ['ธนาคารไทยพาณิชย์', 'SCB'],
    ['KBank KPlus', 'KBANK'],
    ['ธนาคารกรุงไทย', 'KTB'],
    ['Bangkok Bank BBL', 'BBL'],
    ['GSB ออมสิน', 'GSB'],
  ])('infers %s → %s', (text, expected) => {
    expect(inferBankCode(text).value).toBe(expected)
  })

  it('returns null for unknown bank', () => {
    expect(inferBankCode('PromptPay transfer').value).toBeNull()
  })
})

// ─── QR ref extraction ───────────────────────────────────────────────────────

describe('extractRefCodeFromQR', () => {
  it('extracts longest numeric run from generic QR', () => {
    const r = extractRefCodeFromQR('REF12345678901234END')
    expect(r).toBe('12345678901234')
  })

  it('handles EMVCo PromptPay format (tag 62)', () => {
    // Simplified EMVCo with tag 62 bill reference
    const r = extractRefCodeFromQR('0002010102122962050512345678901234END')
    expect(r).not.toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractRefCodeFromQR('')).toBeNull()
  })
})

// ─── extractFields integration ───────────────────────────────────────────────

describe('extractFields', () => {
  const sampleText = `
ธนาคารไทยพาณิชย์
จำนวนเงิน 1,500.00 บาท
ผู้รับ: นิรนาม ทดสอบ
15/05/67 14:30
`

  it('returns income when counterparty matches displayName', () => {
    const r = extractFields(sampleText, null, 'นิรนาม')
    expect(r.suggestedType).toBe('income')
  })

  it('returns expense by default', () => {
    const r = extractFields(sampleText, null, 'สมชาย')
    expect(r.suggestedType).toBe('expense')
  })

  it('sets refCode from QR with high confidence', () => {
    const r = extractFields(sampleText, 'REF99887766554433', null)
    expect(r.refCode.value).toBe('99887766554433')
    expect(r.refCode.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('preserves rawTextDebug only in development', () => {
    // NODE_ENV is 'test' in vitest, so rawTextDebug should be undefined
    const r = extractFields(sampleText, null, null)
    expect(r.rawTextDebug).toBeUndefined()
  })
})
