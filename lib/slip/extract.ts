import type { FieldConfidence, ParsedSlip } from './types'

function normalizeThaiDigits(s: string): string {
  // Also normalise decomposed sara am (U+0E4D U+0E32) → precomposed (U+0E33).
  // Tesseract outputs the decomposed form; every Thai pattern uses the precomposed form.
  return s
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/ํา/g, 'ำ')
}

function parseBaht(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) || n <= 0 ? null : n
}

const AMOUNT_PATTERNS: Array<[RegExp, number]> = [
  // longer forms must precede their prefix variants so the regex alternation matches correctly
  [/(?:จำนวนเงินที่ชำระ|จำนวนเงิน|จำนวน)\s*[฿:]?\s*([\d,]+\.?\d{0,2})/i, 0.9],
  [/(?:ยอดชำระทั้งหมด|ยอดโอน|ยอดเงินที่โอน|เงินที่โอน|ยอดชำระ|ยอดที่ชำระ)\s*[฿:]?\s*([\d,]+\.?\d{0,2})/i, 0.85],
  [/Amount\s*[฿:]?\s*([\d,]+\.?\d{0,2})/i, 0.88],
  [/฿\s*([\d,]+\.?\d{0,2})/, 0.85],
  [/([\d,]+\.?\d{0,2})\s*(?:บาท|THB|Baht)/i, 0.82],
  [/(?:Total|รวม|ยอดรวม)\s*[฿:]?\s*([\d,]+\.?\d{0,2})/i, 0.75],
  [/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/, 0.4],
]

export function extractAmount(text: string): FieldConfidence<number> {
  const t = normalizeThaiDigits(text).replace(/\b(\d{1,6})\s+\.(\d{2})\b/g, '$1.$2')
  for (const [pattern, confidence] of AMOUNT_PATTERNS) {
    const match = t.match(pattern)
    if (match?.[1]) {
      const baht = parseBaht(match[1])
      if (baht !== null) return { value: Math.round(baht * 100), confidence }
    }
  }
  return { value: null, confidence: 0 }
}

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4,
  'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8,
  'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
  มกราคม: 1, กุมภาพันธ์: 2, มีนาคม: 3, เมษายน: 4,
  พฤษภาคม: 5, มิถุนายน: 6, กรกฎาคม: 7, สิงหาคม: 8,
  กันยายน: 9, ตุลาคม: 10, พฤศจิกายน: 11, ธันวาคม: 12,
}

function adjustYear(y: number): number {
  return y > 2400 ? y - 543 : y
}

function buildISO(d: number, mo: number, y: number, h: number, min: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(min)}:00+07:00`
}

// Find HH:mm (or HH.mm) in up to 150 chars after `offset`.
// This handles time printed on a separate line from the date.
function findTimeAfter(text: string, offset: number): { h: number; min: number } | null {
  const segment = text.substring(offset, offset + 150)
  // Prefer colon separator; fall back to period (some banks use "09.30")
  const m =
    segment.match(/\b(\d{1,2}):(\d{2})\b/) ??
    segment.match(/(?:^|\s)(\d{1,2})\.(\d{2})(?:\s|น|$)/)
  if (!m) return null
  const h = +m[1]
  const min = +m[2]
  return h <= 23 && min <= 59 ? { h, min } : null
}

export function extractDateTime(text: string): FieldConfidence<string> {
  // Collapse OCR-inserted spaces around dots in Thai abbreviations (M2-10b)
  // e.g. "พ . ค ." → "พ.ค ." (inter-char); flexible month pattern handles trailing dot
  const t = normalizeThaiDigits(text).replace(/([ก-๙])\s*\.\s*([ก-๙])/g, '$1.$2')

  // dd/MM/yy or dd/MM/yyyy — time may be on same or next line (KBank style)
  const m1 = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m1) {
    const year = adjustYear(parseInt(m1[3].length === 2 ? '25' + m1[3] : m1[3]))
    const time = findTimeAfter(t, m1.index! + m1[0].length)
    const iso = buildISO(+m1[1], +m1[2], year, time?.h ?? 0, time?.min ?? 0)
    if (iso) return { value: iso, confidence: time ? 0.85 : 0.7 }
  }

  // dd MMM (Thai) yyyy — time may be on same or next line (SCB/KTB style)
  // Month patterns allow optional spaces around dots so "พ.ค ." from OCR still matches (M2-10b).
  // The trailing \s* in each month alternative may consume the separator before the year,
  // so \s* (not \s+) follows. rawMonth normalises the captured group for THAI_MONTHS lookup.
  const thKeys = Object.keys(THAI_MONTHS)
    .map((k) => k.replace(/\./g, '\\s*\\.\\s*'))
    .join('|')
  const p2 = new RegExp(`(\\d{1,2})\\s+(${thKeys})\\s*(\\d{2,4})`)
  const m2 = t.match(p2)
  if (m2) {
    const rawMonth = m2[2].replace(/\s*\.\s*/g, '.').trim()
    const month = THAI_MONTHS[rawMonth]
    const year = adjustYear(parseInt(m2[3]))
    const time = findTimeAfter(t, m2.index! + m2[0].length)
    const iso = buildISO(+m2[1], month, year, time?.h ?? 0, time?.min ?? 0)
    if (iso) return { value: iso, confidence: time ? 0.88 : 0.72 }
  }

  // dd-MM-yyyy HH:mm (BBL style)
  const m3 = t.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/)
  if (m3) {
    const year = adjustYear(+m3[3])
    const iso = buildISO(+m3[1], +m3[2], year, +m3[4], +m3[5])
    if (iso) return { value: iso, confidence: 0.85 }
  }

  return { value: null, confidence: 0 }
}

const COUNTERPARTY_PATTERNS: Array<[RegExp, number]> = [
  [/(?:ผู้รับ|ชื่อผู้รับ|โอนไปยัง|ปลายทาง)\s*:?\s*([^\n\d฿]{3,60})/i, 0.8],
  [/(?:Recipient|Beneficiary|To)\s*:?\s*([A-Za-zก-๙\s]{3,60})/i, 0.75],
  [/(?:บัญชีปลายทาง|ผู้รับเงิน)\s*:?\s*([^\n\d฿]{3,60})/i, 0.7],
  [/(?:ชื่อบัญชี|ชื่อเจ้าของบัญชี)\s*:?\s*([^\n\d฿]{3,60})/i, 0.72],
  // K+ bare-name line before masked PromptPay phone (xxx-xxx-NNNN) or national-ID (x-xxxx-xxxxN-NN-N).
  // OCR may insert a blank line between name and mask (\n{1,3}); first nat-ID separator sometimes
  // misread as "=" (e.g. X=XXXX instead of X-XXXX).
  [/([^\n\d฿:]{3,60})\n{1,3}(?:[xX]{3}[-–][xX]{3}[-–]\d{3,4}|[xX][=\-–][xX]{4}[-–][xX]{3,4}\d[-–]\d{2}[-–]\d)\b/, 0.68],
  // Sender label — used for income slips where the payer's name is shown
  [/(?:ผู้โอน|ชื่อผู้โอน)\s*:?\s*([^\n\d฿]{3,60})/i, 0.65],
  [/(?:From|Sender)\s*:?\s*([A-Za-zก-๙\s]{3,60})/i, 0.65],
]

export function extractCounterparty(text: string): FieldConfidence<string> {
  // Normalize like extractAmount/extractDateTime so decomposed sara-am and Thai digits
  // in labels/names don't break matching (parity fix, same class as M2-12).
  const t = normalizeThaiDigits(text)
  for (const [pattern, confidence] of COUNTERPARTY_PATTERNS) {
    const match = t.match(pattern)
    if (match?.[1]) {
      const name = match[1].trim().replace(/\s+/g, ' ')
      if (name.length >= 3) return { value: name, confidence }
    }
  }
  return { value: null, confidence: 0 }
}

const BANK_PATTERNS: Array<[RegExp, string]> = [
  [/(?:SCB|ไทยพาณิชย์|Thai\s*Commercial)/i, 'SCB'],
  [/(?:KBANK|กสิกร|KPlus)/i, 'KBANK'],
  [/(?:KTB|กรุงไทย|Krungthai)/i, 'KTB'],
  [/(?:BBL|กรุงเทพ|Bangkok\s*Bank)/i, 'BBL'],
  [/(?:BAY|กรุงศรี|Ayudhya)/i, 'BAY'],
  [/(?:TTB|ทหารไทย|TMBThanachart)/i, 'TTB'],
  [/(?:CIMB)/i, 'CIMB'],
  [/(?:GSB|ออมสิน)/i, 'GSB'],
  [/(?:BAAC|ธ\.ก\.ส|เพื่อการเกษตร)/i, 'BAAC'],
]

export function inferBankCode(text: string): FieldConfidence<string> {
  const header = text.substring(0, Math.min(300, text.length))
  // Use earliest text-position match so the issuing bank (always first in the slip header)
  // wins over a destination bank name that appears later in the same window (M2-8b).
  let earliest: { code: string; index: number } | null = null
  for (const [pattern, code] of BANK_PATTERNS) {
    const m = header.match(pattern)
    if (m && m.index !== undefined) {
      if (!earliest || m.index < earliest.index) earliest = { code, index: m.index }
    }
  }
  if (earliest) return { value: earliest.code, confidence: 0.95 }
  for (const [pattern, code] of BANK_PATTERNS) {
    if (pattern.test(text)) return { value: code, confidence: 0.75 }
  }
  return { value: null, confidence: 0 }
}

export function extractRefCodeFromQR(qrData: string): string | null {
  if (!qrData) return null

  // EMVCo PromptPay QR: only tag 62 sub-field 05 (Reference Label) is a
  // per-transaction identifier. Account numbers and PromptPay IDs in other
  // fields repeat across slips and must NOT be used as ref_code (M2-6).
  // TLV format: 62[2-digit-total-len]...[05[2-digit-sub-len][value]]
  if (qrData.startsWith('000201')) {
    const tag62 = qrData.match(/62\d{2}05(\d{2})(\w{1,30})/)
    if (tag62) {
      const len = parseInt(tag62[1])
      const val = tag62[2].substring(0, len)
      if (val.length >= 6) return val
    }
    return null
  }

  // Non-EMVCo: prefer 15+ digit sequences (transaction refs);
  // 10–12 digit sequences are typically account numbers that repeat.
  const nums = qrData.match(/\d{8,}/g)
  if (!nums) return qrData.substring(0, 100)
  const longRef = nums.find((n) => n.length >= 15)
  if (longRef) return longRef
  const medRef = nums.find((n) => n.length > 13)
  if (medRef) return medRef
  return null
}

export function extractFields(
  ocrText: string,
  qrData: string | null,
  displayName: string | null,
): ParsedSlip {
  const amount = extractAmount(ocrText)
  const datetime = extractDateTime(ocrText)
  const counterparty = extractCounterparty(ocrText)
  const bankCode = inferBankCode(ocrText)

  let refCode: FieldConfidence<string>
  if (qrData) {
    const ref = extractRefCodeFromQR(qrData)
    refCode = ref ? { value: ref, confidence: 0.95 } : { value: null, confidence: 0 }
  } else {
    const m = ocrText.match(
      /(?:Ref|อ้างอิง|เลขที่อ้างอิง|เลขรายการ|หมายเลขอ้างอิง|ยืนยันเลขที่)\s*[:#]?\s*([\w-]{6,30})/i,
    )
    refCode = m ? { value: m[1], confidence: 0.5 } : { value: null, confidence: 0 }
  }

  // Income heuristic: recipient name matches user's display name → they received the money
  let suggestedType: 'income' | 'expense' = 'expense'
  if (displayName && counterparty.value) {
    const first = displayName.split(/\s+/)[0].toLowerCase()
    if (first.length >= 2 && counterparty.value.toLowerCase().includes(first)) {
      suggestedType = 'income'
    }
  }

  return {
    amount,
    datetime,
    counterparty,
    refCode,
    bankCode,
    suggestedType,
    rawTextDebug: process.env.NODE_ENV === 'development' ? ocrText : undefined,
  }
}
