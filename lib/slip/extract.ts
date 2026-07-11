import type { FieldConfidence, ParsedSlip, SourceApp } from './types'

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
    // 2-digit Buddhist-era year (M7-C): TTB prints "d MMM yy" (e.g. "2 มิ.ย. 69").
    // Without this, "69" parses as literal year 69 (adjustYear leaves it alone —
    // only 4-digit BE years exceed the >2400 threshold), buildISO then rejects it
    // (< 1900) and the caller silently falls back to "now". Prepend the current
    // BE century, same as the dd/MM/yy path just above, before adjusting.
    const rawYear = m2[3]
    const year = adjustYear(parseInt(rawYear.length === 2 ? '25' + rawYear : rawYear))
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
  // Bare ไปยัง added for KTB (label on its own line, name on next line) — \s consumes the \n.
  [/(?:ผู้รับ|ชื่อผู้รับ|โอนไปยัง|ไปยัง|ปลายทาง)\s*:?\s*([^\n\d฿]{3,60})/i, 0.8],
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

// TTB layout: no labels; each party is a `name\nXXX-X-XXNNN-N` block (bank-account mask,
// 3X-1X-2X-3digit-1digit). Recipient is the LAST occurrence — sender is printed first.
const TTB_POSITIONAL = /([^\n]{3,80})\n[xX]{3}[-–][xX][-–][xX]{2}\d{3}[-–]\d/g

// Paotang merchant name sits between the `G-Wallet ID` line and `ค่าสินค้า/บริการ`, heavily OCR-degraded.
// Anchor tolerates OCR variants of `ID:` (e.g. `!0:`, `1D`, `lD`) — see QA-FIELD-2b.
const PAOTANG_SECTION = /G-?Wallet\s*[I!1l][D0]\s*:?[^\n]*\n([\s\S]*?)ค่าสินค้า\s*\/\s*บริการ/i

function cleanCounterparty(raw: string): string {
  // Strip leading OCR junk (digits, symbols, whitespace) that precedes the actual name.
  // Thai-digit prefixes are already normalised to ASCII by normalizeThaiDigits.
  let s = raw.replace(/^[^ก-๙a-zA-Z]+/, '').trim().replace(/\s+/g, ' ')
  // If a Thai char appears later in the string, strip any leading run of latin/glyph junk
  // (e.g. `Ub นาย ...`, `pp UNE ธนภูมิ ...`) up to the first Thai char. Don't disturb
  // legitimately latin-named recipients (no Thai char anywhere). QA-FIELD-2a item 3.
  if (/[ก-๙]/.test(s) && /^[A-Za-z]/.test(s)) {
    s = s.replace(/^[A-Za-z][A-Za-z\s]*?(?=[ก-๙])/, '')
  }
  return s
}

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

  // TTB positional fallback — require ≥2 mask blocks before firing.
  // Transfers carry the mask on BOTH sender and recipient (last = recipient ✓);
  // bill payments only mask the sender, so single-match would return the payer themselves
  // — wrong-but-plausible, worse than empty. Bills fall through to null
  // (accepted known-limitation, same as KTB bill). QA-FIELD-2a item 2.
  const ttbMatches = [...t.matchAll(TTB_POSITIONAL)]
  if (ttbMatches.length >= 2) {
    const cleaned = cleanCounterparty(ttbMatches[ttbMatches.length - 1][1])
    if (cleaned.length >= 3) return { value: cleaned, confidence: 0.6 }
  }

  // Paotang: first Thai-containing line in the merchant section.
  const paotang = t.match(PAOTANG_SECTION)
  if (paotang) {
    for (const line of paotang[1].split('\n')) {
      const cleaned = cleanCounterparty(line)
      if (cleaned.length >= 3 && /[ก-๙]/.test(cleaned)) {
        return { value: cleaned, confidence: 0.5 }
      }
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

// ─── M8: sender mask + source app (Smart Account Mapping) ────────────────────

// Bank-account mask shape shared by TTB and KBank make/K+ slips: two fully
// masked groups, then a group mixing mask chars with 3–5 visible digits, then
// a final single char (a visible digit on TTB/KTB, still masked on K+/make).
// This is deliberately narrower than the PromptPay-phone mask (`xxx-xxx-NNNN`,
// 3-char middle group) or the nat-ID mask (`x-xxxx-xxxxN-NN-N`, 5 groups) used
// for the RECIPIENT on the same slips — see TTB_POSITIONAL/COUNTERPARTY_PATTERNS
// above — so `.match()` (first occurrence) reliably lands on the SENDER block,
// which is always printed first (real corpus: KTB "XXX-X-XX441-5", TTB
// "XXX-X-XX955-1", K+/make "xxx-x-x5357-x").
const SENDER_MASK_PATTERN = /[xX]{3}[-–][xX][-–][xX]*(\d{3,5})[-–]([xX]|\d)/

/**
 * Last visible digits of the SENDER's masked account number (M8). The first
 * account-mask block on a slip is always the sender (see module comment
 * above) — e.g. TTB "XXX-X-XX441-5" → "441-5"; K+/make "xxx-x-x5357-x" → "5357"
 * (the trailing group is still masked, so no digit is appended). Combined with
 * bankCode + sourceApp into the slip_account_map fingerprint (lib/account-map.ts)
 * and matched against accounts.number_hint to disambiguate same-bank accounts.
 */
export function extractSenderMask(text: string): FieldConfidence<string> {
  const t = normalizeThaiDigits(text)
  const m = t.match(SENDER_MASK_PATTERN)
  if (!m) return { value: null, confidence: 0 }
  const digits = m[1]
  const last = m[2]
  const value = /\d/.test(last) ? `${digits}-${last}` : digits
  return { value, confidence: 0.75 }
}

// Source-app signatures, most-reliable first. Paotang and ttb are confirmed
// against real qa-lab OCR corpus strings (see tests/unit/extract.test.ts):
// the `G-Wallet ID:` anchor (tolerating OCR mangling, same as PAOTANG_SECTION)
// and a bare "ttb" line printed between the sender's mask and the destination
// bank name. make/kplus/ktbnext have no literal brand text in the corpus
// captured so far (the existing fixtures are narrow counterparty-focused
// excerpts, not full raw OCR) — these three are best-effort literal matches,
// flagged here for qa-lab to verify/extend against fuller real slip text.
// Even when these three don't fire, the account-mapping precedence still
// resolves correctly for same-bank accounts via number_hint + sender mask.
const SOURCE_APP_PATTERNS: Array<[RegExp, SourceApp]> = [
  [/G-?Wallet\s*[I!1l][D0]|เป๋าตัง/i, 'paotang'],
  [/^ttb$/im, 'ttb'],
  [/Krungthai\s*NEXT|กรุงไทย\s*เน็กซ์/i, 'ktbnext'],
  [/\bMAKE\b/, 'make'], // case-sensitive: avoid matching incidental lowercase "make"
  [/\bK\s?\+|K\s?PLUS\b/i, 'kplus'],
]

/**
 * Detect the consumer app that produced the slip (M8), when a recognizable
 * signature is present. Separates wallet/app accounts sharing one bank_code
 * (e.g. the Paotang wallet vs. a plain KTB bank account) — see module comment
 * on SOURCE_APP_PATTERNS for which signatures are corpus-verified vs. best-effort.
 */
export function detectSourceApp(text: string): FieldConfidence<SourceApp> {
  const t = normalizeThaiDigits(text)
  for (const [pattern, app] of SOURCE_APP_PATTERNS) {
    if (pattern.test(t)) {
      const confidence = app === 'paotang' || app === 'ttb' ? 0.7 : 0.5
      return { value: app, confidence }
    }
  }
  return { value: null, confidence: 0 }
}

// EMVCo QR payloads are a flat sequence of tag(2)+len(2)+value(len) records
// (BER-TLV style); tag 62 ("Additional Data Field Template") nests another such
// sequence as its value. Walking this structure from position 0 (rather than
// regex-scanning for the tag/label bytes) is the only way to know a "62" match
// is really a top-level tag and not coincidental digits inside an unrelated
// field's value (M7-B — the old /62\d{2}05/ regex could match mid-payload).
function parseEMVCoTLV(payload: string): Map<string, string> {
  const fields = new Map<string, string>()
  let i = 0
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2)
    const lenStr = payload.slice(i + 2, i + 4)
    if (!/^\d{2}$/.test(lenStr)) break // not a valid TLV length field — stop
    const len = parseInt(lenStr, 10)
    const value = payload.slice(i + 4, i + 4 + len)
    if (value.length < len) break // truncated — rest of the string isn't a full record
    fields.set(tag, value)
    i += 4 + len
  }
  return fields
}

export function extractRefCodeFromQR(qrData: string): string | null {
  if (!qrData) return null

  // EMVCo PromptPay QR: only tag 62 sub-field 05 (Reference Label) is a
  // per-transaction identifier. Account numbers and PromptPay IDs in other
  // fields repeat across slips and must NOT be used as ref_code (M2-6).
  if (qrData.startsWith('000201')) {
    const root = parseEMVCoTLV(qrData)
    const tag62 = root.get('62')
    if (!tag62) return null
    const sub = parseEMVCoTLV(tag62)
    const val = sub.get('05')
    return val && val.length >= 6 ? val : null
  }

  // Non-EMVCo: prefer 15+ digit sequences (transaction refs);
  // 10–12 digit sequences are typically account numbers that repeat.
  // If nothing long enough is present, return null — NEVER fall back to a chunk
  // of the raw payload, which for some banks (e.g. MAKE/KBank slip-verify QRs) is
  // a constant prefix/merchant id that repeats across every slip and would make
  // distinct transactions collide on UNIQUE(user_id, ref_code). A null here lets
  // extractFields fall back to the printed transaction number from OCR instead.
  const nums = qrData.match(/\d{8,}/g)
  if (!nums) return null
  const longRef = nums.find((n) => n.length >= 15)
  if (longRef) return longRef
  const medRef = nums.find((n) => n.length > 13)
  if (medRef) return medRef
  return null
}

// Printed transaction/reference number from OCR text. Used when the QR carries no
// per-transaction reference (MAKE/KBank slip QRs are EMVCo without tag 62-05), so
// these slips still get a unique ref_code for dedup instead of falling through to
// the fragile amount+time soft-dedup. Labels cover KBank/MAKE ("เลขที่รายการ",
// "เลขที่ทำรายการ") plus the generic Thai/English reference labels.
export function extractRefCodeFromText(ocrText: string): string | null {
  const t = normalizeThaiDigits(ocrText)
  // Bare "อ้างอิง" and "รหัสอ้างอิง" are dropped (M7-B): recurring bill slips print
  // a constant biller Ref.1/customer id under exactly these labels — identical
  // every month — which previously masqueraded as a per-transaction ref_code and
  // false-blocked a genuinely new month's payment as a duplicate. Only labels that
  // are structurally per-transaction (a transaction/reference *number*, not a
  // biller's customer reference) remain.
  const m = t.match(
    /(?:เลขที่ทำรายการ|เลขที่รายการ|เลขที่อ้างอิง|หมายเลขอ้างอิง|เลขรายการ|ยืนยันเลขที่|Ref(?:erence)?(?:\s*(?:No|Number|ID))?)\s*[:#.]?\s*([A-Za-z0-9-]{6,30})/i,
  )
  return m ? m[1] : null
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
  const senderMask = extractSenderMask(ocrText)
  const sourceApp = detectSourceApp(ocrText)

  // ref_code precedence: a per-transaction reference from the QR (highest trust),
  // else the transaction number printed on the slip (OCR). The OCR fallback runs
  // even when a QR is present but yielded no usable reference — MAKE/KBank slip
  // QRs are EMVCo without tag 62-05, so without this those slips would never get
  // a ref_code and would rely on the amount+time soft-dedup instead of their own
  // unique เลขที่รายการ.
  const qrRef = qrData ? extractRefCodeFromQR(qrData) : null
  let refCode: FieldConfidence<string>
  if (qrRef) {
    refCode = { value: qrRef, confidence: 0.95 }
  } else {
    const textRef = extractRefCodeFromText(ocrText)
    refCode = textRef ? { value: textRef, confidence: 0.6 } : { value: null, confidence: 0 }
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
    senderMask,
    sourceApp,
    suggestedType,
    rawTextDebug: process.env.NODE_ENV === 'development' ? ocrText : undefined,
  }
}
