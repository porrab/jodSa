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

  it('parses ยอดโอน label (เป๋าตัง / PromptPay wallet style)', () => {
    const r = extractAmount('ยอดโอน 500.00')
    expect(r.value).toBe(50000)
    expect(r.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('parses ยอดชำระ label', () => {
    const r = extractAmount('ยอดชำระ 1,200.00')
    expect(r.value).toBe(120000)
  })

  it('parses ยอดชำระทั้งหมด label (เป๋าตัง full-form, M2-11b)', () => {
    const r = extractAmount('ยอดชำระทั้งหมด 1,500.00')
    expect(r.value).toBe(150000)
    expect(r.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('parses จำนวนเงินที่ชำระ label (payment form full-form, M2-11b)', () => {
    const r = extractAmount('จำนวนเงินที่ชำระ 800.00')
    expect(r.value).toBe(80000)
    expect(r.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('normalizes Thai digits ๕๐๐.๐๐', () => {
    const r = extractAmount('จำนวน ๕๐๐.๐๐')
    expect(r.value).toBe(50000)
  })

  it('normalizes decomposed sara am (U+0E4D U+0E32) from Tesseract OCR (M2-12)', () => {
    // Tesseract outputs ํา (decomposed) but patterns use ำ (precomposed U+0E33)
    const decomposed = 'จํานวนเงินที่ชําระ 800.00' // ํา = ํา
    const r = extractAmount(decomposed)
    expect(r.value).toBe(80000)
  })

  it('converts 2-decimal baht string to satang (1.50 → 150)', () => {
    const r = extractAmount('จำนวน 1.50')
    expect(r.value).toBe(150)
  })

  it('joins large-integer + superscript decimal split by newline (QA-M2-1 TTB bill)', () => {
    const r = extractAmount('30\n.00\nค่าธรรมเนียม 0.00')
    expect(r.value).toBe(3000)
  })

  it('joins large-integer + superscript decimal split by space (QA-M2-1 TTB bill space variant)', () => {
    const r = extractAmount('30 .00\nค่าธรรมเนียม 0.00')
    expect(r.value).toBe(3000)
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

  it('parses date with time on a separate line', () => {
    const r = extractDateTime('15/05/67\n14:30')
    expect(r.value).toMatch(/^2024-05-15T14:30:00\+07:00$/)
  })

  it('parses Thai-month date with time on a separate line', () => {
    const r = extractDateTime('15 พ.ค. 2567\n14:30')
    expect(r.value).toMatch(/^2024-05-15T14:30:00\+07:00$/)
  })

  it('parses time with period separator (HH.mm)', () => {
    const r = extractDateTime('15/05/67 14.30')
    expect(r.value).toMatch(/^2024-05-15T14:30:00\+07:00$/)
  })

  it('parses Thai month abbreviation with OCR-spaced dots "พ . ค ." (M2-10b)', () => {
    const r = extractDateTime('15 พ . ค . 2567 14:30')
    expect(r.value).toMatch(/^2024-05-15T14:30:00\+07:00$/)
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

  it('extracts ผู้โอน (sender) label for income slips', () => {
    const r = extractCounterparty('ผู้โอน: สมชาย ใจดี')
    expect(r.value).toContain('สมชาย')
  })

  it('extracts ชื่อบัญชี (account name) label', () => {
    const r = extractCounterparty('ชื่อบัญชี: นาย วิชาย มีดี')
    expect(r.value).toContain('วิชาย')
  })

  it('extracts bare name before masked PromptPay phone with blank line (QA-M2-2 KBank make real OCR)', () => {
    // Real OCR: blank line + uppercase X between name and mask
    const r = extractCounterparty('โชติสิริ บุญเต็ม\n\nXXX-XXX-1535')
    expect(r.value).toBe('โชติสิริ บุญเต็ม')
    expect(r.confidence).toBeGreaterThanOrEqual(0.65)
  })

  it('extracts bare name before masked PromptPay phone single newline (QA-M2-2 variant)', () => {
    const r = extractCounterparty('โชติสิริ บุญเต็ม\nxxx-xxx-1535')
    expect(r.value).toBe('โชติสิริ บุญเต็ม')
    expect(r.confidence).toBeGreaterThanOrEqual(0.65)
  })

  it('extracts bare name before nat-ID mask with OCR = separator (QA-M2-2 KBank make slip 2 real OCR)', () => {
    // Real OCR: blank line + uppercase X + "=" misread for first dash
    const r = extractCounterparty('นางปราณี แสงตระการ\n\nX=XXXX-XXXX5-94-0')
    expect(r.value).toBe('นางปราณี แสงตระการ')
    expect(r.confidence).toBeGreaterThanOrEqual(0.65)
  })

  it('extracts bare name before nat-ID mask standard dash (QA-M2-2 KBank make slip 2 standard)', () => {
    const r = extractCounterparty('นางปราณี แสงตระการ\nx-xxxx-xxxx5-94-0')
    expect(r.value).toBe('นางปราณี แสงตระการ')
    expect(r.confidence).toBeGreaterThanOrEqual(0.65)
  })

  it('does NOT capture sender name before bank account mask xxx-x-xNNNN-x (QA-M2-2 negative)', () => {
    const r = extractCounterparty('สมชาย ใจดี\nxxx-x-x5678-x')
    expect(r.value).toBeNull()
  })

  // ── FIELD-2 parts 2–3: KTB / TTB / Paotang real OCR strings ─────────────────

  it('extracts KTB recipient via bare ไปยัง label on its own line (FIELD-2 KTB real OCR)', () => {
    const r = extractCounterparty(
      'นายธนภูมิ เสนีวงศ์ ญ อ* **\nกรุงไทย\nXXX-X-XX441-5\nไปยัง\nนางปราณี แสงตระการ\nพร้อมเพย์\nX XXXX XXXX5 94 0\nจํานวนเงิน                             55.00 บาท',
    )
    expect(r.value).toBe('นางปราณี แสงตระการ')
    expect(r.confidence).toBeGreaterThanOrEqual(0.75)
  })

  it('extracts TTB recipient (2nd block) before XXX-X-XXNNN-N mask, skipping sender (FIELD-2 TTB real OCR)', () => {
    const r = extractCounterparty(
      'โอนเงินสําเร็จ\n2 มิ.ย. 69, 20:58 น.\n4,000.00\nค่าธรรมเนียม 0.00\nยะ๒ นาย รนภูมิ เสนีวงศ์ ณ อยุธยา\nXXX-X-XX955-1\nttb\n๐  นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา\nXXX-X-XX357-1\nKBANK',
    )
    expect(r.value).toBe('นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา')
    expect(r.confidence).toBeGreaterThanOrEqual(0.55)
  })

  it('extracts TTB จ่ายบิล recipient name (2nd block) — BillPayment slip layout (FIELD-2 TTB bill real OCR)', () => {
    const r = extractCounterparty(
      'จ่ายบิลสําเร็จ\nนาย ธนภูมิ เสนีวงศ์ ณ อยุธยา\nXXX-X-XX955-1\nttb\nนาง ศิริพร ศรีธวัช ณ อยุธยา\nXXX-X-XX123-4\nKBANK',
    )
    expect(r.value).toBe('นาง ศิริพร ศรีธวัช ณ อยุธยา')
  })

  it('extracts Paotang merchant name between G-Wallet ID and ค่าสินค้า/บริการ (FIELD-2 Paotang real OCR)', () => {
    const r = extractCounterparty(
      'fc)   ธนภูมิ เสน็วงศ์ ณ p***\nG-Wallet ID: **** **%**** 1840\n¥    รานสุก รสเดด\nLE      อาหาร ของหวาน เครื่องดื่ม\nค่าสินค้า/บริการ               65 บาท',
    )
    expect(r.value).toBe('รานสุก รสเดด')
    expect(r.confidence).toBeGreaterThanOrEqual(0.4)
  })

  it('does NOT trip TTB positional on K+ slip (bank-account mask format differs)', () => {
    // K+ uses xxx-x-xNNNN-x (1 digit + 4 digits middle); TTB uses XXX-X-XXNNN-N (2X + 3 digits).
    // K+ bare-name pattern should catch โชติสิริ first; TTB positional must not fire on K+ mask.
    const r = extractCounterparty(
      'ธนภูมิ เสนีวงศ์ ณ อ\nxxx-x-x5357-x\nโชติสิริ บุญเต็ม\nxxx-xxx-1535',
    )
    expect(r.value).toBe('โชติสิริ บุญเต็ม')
  })

  // ── QA-FIELD-2a/2b round-2 fixes ────────────────────────────────────────────

  it('TTB จ่ายบิล (single mask = sender only) returns null, not the payer (QA-FIELD-2a item 2)', () => {
    // Real OCR from BillPayment_20260522_132356.jpg — biller is `SCB มณี SHOP` (id-based, no mask).
    // Only the payer carries XXX-X-XXNNN-N. Positional fallback must NOT fire (requires ≥2 masks);
    // bill biller name is scoped out (accepted known-limitation) → empty is the correct outcome.
    const r = extractCounterparty(
      'จ่ายบิลสําเร็จ\n22 พ.ค. 69, 13:23 น.\nUb นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา\nXXX-X-XX955-1\nttb\nSCB มณี SHOP\n(1234567890)',
    )
    expect(r.value).toBeNull()
  })

  it('TTB transfer (two masks) still pre-fills recipient — round-2 regression guard', () => {
    // Same TTB transfer fixture as the earlier FIELD-2 test — must remain green after the
    // ≥2-mask gating change.
    const r = extractCounterparty(
      'โอนเงินสําเร็จ\n2 มิ.ย. 69, 20:58 น.\nยะ๒ นาย รนภูมิ เสนีวงศ์ ณ อยุธยา\nXXX-X-XX955-1\nttb\n๐  นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา\nXXX-X-XX357-1\nKBANK',
    )
    expect(r.value).toBe('นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา')
  })

  it('cleanCounterparty strips leading latin junk before Thai name (QA-FIELD-2a item 3)', () => {
    // Real OCR transfer with latin glyph junk `pp UNE ` before the Thai recipient name.
    // Force the path through TTB_POSITIONAL by giving it two masked blocks.
    const r = extractCounterparty(
      'โอนเงิน\nนาย ธนภูมิ เสนีวงศ์ ณ อยุธยา\nXXX-X-XX955-1\nttb\npp UNE นาง ศิริพร ศรีธวัช ณ อยุธยา\nXXX-X-XX123-4\nKBANK',
    )
    expect(r.value).toBe('นาง ศิริพร ศรีธวัช ณ อยุธยา')
  })

  it('does not strip latin from a legitimately latin-named recipient (no Thai in name)', () => {
    // Negative side of the latin-strip rule: when no Thai char follows, leave the latin name alone.
    const r = extractCounterparty('Recipient: John Smith')
    expect(r.value).toContain('John Smith')
  })

  it('Paotang anchor tolerates `G-Wallet !0:` OCR variant of `G-Wallet ID:` (QA-FIELD-2b)', () => {
    // Real OCR from PaoTang_2026_06_07 18_39_32.png had the ID-line mangled to `G-Wallet !0: ...`.
    const r = extractCounterparty(
      'ธนภูมิ เสน็วงศ์\nG-Wallet !0: **** **** **** 1840\n¥    ปราณี\nLE      บริการ\nค่าสินค้า/บริการ               100 บาท',
    )
    expect(r.value).toContain('ปราณี')
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

  it('returns KTB when slip header is KTB but destination bank is TTB', () => {
    const text = 'ธนาคารกรุงไทย\nโอนจาก: xxxxxx\nไปยัง: บัญชีธนาคารทหารไทยธนชาต (TTB)'
    expect(inferBankCode(text).value).toBe('KTB')
  })

  it('returns TTB when TTB appears at earlier position in header than KBANK destination (M2-8b)', () => {
    const text = 'ธนาคารทหารไทยธนชาต\nโอนเงิน\nไปยัง KBANK xxx-x-xxxxx-x'
    expect(inferBankCode(text).value).toBe('TTB')
  })
})

// ─── QR ref extraction ───────────────────────────────────────────────────────

describe('extractRefCodeFromQR', () => {
  it('extracts longest numeric run from generic QR', () => {
    const r = extractRefCodeFromQR('REF12345678901234END')
    expect(r).toBe('12345678901234')
  })

  it('handles EMVCo PromptPay format (tag 62 sub-field 05)', () => {
    // 62[05=total-len] 05[12=sub-len] [12-char ref]
    const r = extractRefCodeFromQR('0002010102122962050512345678901234END')
    expect(r).not.toBeNull()
  })

  it('returns null for EMVCo QR with no tag 62 reference label', () => {
    // PromptPay static QR — no tag 62 sub-field 05; must not use account/phone as ref_code
    expect(extractRefCodeFromQR('0002010102121234567890')).toBeNull()
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
