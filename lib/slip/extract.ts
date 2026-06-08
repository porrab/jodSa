import type { FieldConfidence, ParsedSlip } from './types'

function normalizeThaiDigits(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
}

function parseBaht(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) || n <= 0 ? null : n
}

const AMOUNT_PATTERNS: Array<[RegExp, number]> = [
  [/(?:จำนวนเงิน|จำนวน)\s*[฿:]?\s*([\d,]+\.?\d{0,2})/i, 0.9],
  [/Amount\s*[฿:]?\s*([\d,]+\.?\d{0,2})/i, 0.88],
  [/฿\s*([\d,]+\.?\d{0,2})/, 0.85],
  [/([\d,]+\.?\d{0,2})\s*(?:บาท|THB|Baht)/i, 0.82],
  [/(?:Total|รวม|ยอดรวม)\s*[฿:]?\s*([\d,]+\.?\d{0,2})/i, 0.75],
  [/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/, 0.4],
]

export function extractAmount(text: string): FieldConfidence<number> {
  const t = normalizeThaiDigits(text)
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

export function extractDateTime(text: string): FieldConfidence<string> {
  const t = normalizeThaiDigits(text)

  // dd/MM/yy or dd/MM/yyyy with optional HH:mm (KBank style)
  const m1 = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{2}):(\d{2}))?/)
  if (m1) {
    const year = adjustYear(parseInt(m1[3].length === 2 ? '25' + m1[3] : m1[3]))
    const iso = buildISO(+m1[1], +m1[2], year, +(m1[4] ?? 0), +(m1[5] ?? 0))
    if (iso) return { value: iso, confidence: 0.85 }
  }

  // dd MMM (Thai) yyyy with optional HH:mm (SCB/KTB style)
  const thKeys = Object.keys(THAI_MONTHS)
    .map((k) => k.replace(/\./g, '\\.'))
    .join('|')
  const p2 = new RegExp(`(\\d{1,2})\\s+(${thKeys})\\s+(\\d{2,4})(?:\\s+(\\d{2}):(\\d{2}))?`)
  const m2 = t.match(p2)
  if (m2) {
    const month = THAI_MONTHS[m2[2]]
    const year = adjustYear(parseInt(m2[3]))
    const iso = buildISO(+m2[1], month, year, +(m2[4] ?? 0), +(m2[5] ?? 0))
    if (iso) return { value: iso, confidence: 0.88 }
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
]

export function extractCounterparty(text: string): FieldConfidence<string> {
  for (const [pattern, confidence] of COUNTERPARTY_PATTERNS) {
    const match = text.match(pattern)
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
  for (const [pattern, code] of BANK_PATTERNS) {
    if (pattern.test(text)) return { value: code, confidence: 0.9 }
  }
  return { value: null, confidence: 0 }
}

export function extractRefCodeFromQR(qrData: string): string | null {
  if (!qrData) return null

  // EMVCo PromptPay: tag 62 contains bill reference fields (05=bill ref, 06=customer ref)
  if (qrData.startsWith('000201')) {
    const tag62 = qrData.match(/6205(\d{2})(\d+)/)
    if (tag62) return tag62[2].substring(0, 50)
  }

  // Generic: take the longest numeric run ≥ 8 digits
  const nums = qrData.match(/\d{8,}/g)
  if (nums) return nums.reduce((a, b) => (a.length >= b.length ? a : b))

  return qrData.substring(0, 100)
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
    const m = ocrText.match(/(?:Ref|อ้างอิง|เลขที่อ้างอิง)\s*[:#]?\s*([\w-]{6,30})/i)
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
