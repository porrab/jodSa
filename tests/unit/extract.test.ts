import { describe, it, expect } from 'vitest'
import {
  extractAmount,
  extractDateTime,
  extractCounterparty,
  inferBankCode,
  extractRefCodeFromQR,
  extractRefCodeFromText,
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

  // M7-C: 2-digit Buddhist-era year in the Thai-month path. TTB prints "d MMM yy"
  // (e.g. "2 มิ.ย. 69") on every slip; before the fix this parsed as literal year
  // 69, buildISO rejected it (< 1900), and extractDateTime returned null — the
  // caller then silently fell back to "now" (FIELD/M7 report). Real OCR strings
  // from the qa-lab corpus (REVIEW-INBOX FIELD-2-capture-2026-06-13).
  describe('2-digit Buddhist-era year (M7-C)', () => {
    it('TTB โอนเงิน — "2 มิ.ย. 69, 20:58 น." → 2026-06-02 20:58', () => {
      const r = extractDateTime('โอนเงินสําเร็จ\n2 มิ.ย. 69, 20:58 น.\n4,000.00')
      expect(r.value).toMatch(/^2026-06-02T20:58:00\+07:00$/)
    })

    it('TTB จ่ายบิล — "21 พ.ค. 69, 11:54 u." → 2026-05-21 11:54', () => {
      // trailing "u." is an OCR misread of "น." — irrelevant to date/time matching
      const r = extractDateTime('จ่ายบัลสําเร็จ\n21 พ.ค. 69, 11:54 u.\nค่าธรรมเนียม 0.00')
      expect(r.value).toMatch(/^2026-05-21T11:54:00\+07:00$/)
    })

    it('a bare 2-digit year still resolves without a preceding "25" in the source text', () => {
      const r = extractDateTime('9 ก.ค. 69 08:00')
      expect(r.value).toMatch(/^2026-07-09T08:00:00\+07:00$/)
    })

    it('does not regress the existing 4-digit BE year path (KTB, "15 มี.ค. 2569")', () => {
      // Real OCR: `วันที่ทํารายการ                15 มี.ค. 2569 - 19:10`
      const r = extractDateTime('วันที่ทํารายการ                15 มี.ค. 2569 - 19:10')
      expect(r.value).toMatch(/^2026-03-15T19:10:00\+07:00$/)
    })
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

  // Real EMVCo TLV: tag(2)+len(2)+value(len), sequential from position 0.
  //   00 02 "01"                          — Payload Format Indicator
  //   01 02 "12"                          — Point of Initiation Method
  //   62 16 "0512123456789012"            — Additional Data Field Template
  //     └ 05 12 "123456789012"            — Reference Label (nested TLV)
  //   63 04 "ABCD"                        — CRC
  it('handles EMVCo PromptPay format (tag 62 sub-field 05), walking real TLV structure', () => {
    const qr = '000201' + '010212' + '62160512123456789012' + '6304ABCD'
    const r = extractRefCodeFromQR(qr)
    expect(r).toBe('123456789012')
  })

  it('returns null for EMVCo QR with no tag 62 reference label', () => {
    // PromptPay static QR — no tag 62 sub-field 05; must not use account/phone as ref_code
    expect(extractRefCodeFromQR('0002010102121234567890')).toBeNull()
  })

  // M7-B: the old /62\d{2}05/ regex matched these four bytes ("6205...")
  // wherever they happened to appear, even mid-payload inside an unrelated
  // field's value — not necessarily a real top-level tag-62 template. A real
  // TLV walk from position 0 must not be fooled by that coincidence.
  it('does not false-match "6205"-shaped bytes that land mid-payload, not at a real TLV boundary', () => {
    // Field 01 declares len=02 but its value ("01") is followed immediately by
    // bytes that spell "6205..." — a regex scan would match them as tag 62/
    // sub-05, but walking the TLV structure from position 0 correctly reads
    // tag "01" (len 02, value "01"), then continues from the true next
    // boundary and never treats the embedded "6205" text as a real tag.
    const qr = '000201' + '01026205' + '05121234567890' + '6304ABCD'
    expect(extractRefCodeFromQR(qr)).toBeNull()
  })

  it('stops cleanly on a truncated/malformed TLV instead of misreading it', () => {
    // "62" tag claims len=99 but only a handful of bytes follow — must not throw
    // or return a garbage substring.
    const qr = '000201' + '629905'
    expect(extractRefCodeFromQR(qr)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractRefCodeFromQR('')).toBeNull()
  })

  it('returns null for a non-EMVCo QR with no long digit run (no repeating-prefix fallback)', () => {
    // A MAKE/KBank-style slip-verify payload whose only constant is a short
    // merchant/terminal id must NOT become a ref_code, or every slip collides.
    expect(extractRefCodeFromQR('https://slip.kbank/verify?m=001')).toBeNull()
    expect(extractRefCodeFromQR('KBANKSLIPVERIFY')).toBeNull()
  })
})

// ─── OCR ref extraction (printed transaction number) ─────────────────────────

describe('extractRefCodeFromText', () => {
  it('reads MAKE/KBank เลขที่รายการ label', () => {
    expect(extractRefCodeFromText('เลขที่รายการ: 015062512345678')).toBe('015062512345678')
  })

  it('reads เลขที่ทำรายการ label', () => {
    expect(extractRefCodeFromText('เลขที่ทำรายการ 2024ABC12345')).toBe('2024ABC12345')
  })

  it('reads a generic Reference No label', () => {
    expect(extractRefCodeFromText('Reference No: ABCD1234EFGH')).toBe('ABCD1234EFGH')
  })

  it('normalises Thai digits in the reference value', () => {
    expect(extractRefCodeFromText('เลขที่รายการ ๐๑๕๐๖๒๕๑๒๓')).toBe('0150625123')
  })

  it('returns null when no reference label is present', () => {
    expect(extractRefCodeFromText('จำนวนเงิน 100.00 บาท')).toBeNull()
  })

  // M7-B: bare "อ้างอิง" and "รหัสอ้างอิง" are dropped — on recurring bill
  // slips these labels carry the biller's Ref.1/customer id, which stays the
  // same for every payment to that biller (only the amount/date change), so
  // treating it as a per-transaction ref_code false-blocked a genuinely new
  // month's payment as a duplicate. Per-transaction labels (เลขที่รายการ,
  // เลขที่ทำรายการ, เลขที่อ้างอิง, Ref No.) are unaffected.
  it('no longer captures a bare "อ้างอิง" label (dropped — constant per-biller id)', () => {
    expect(extractRefCodeFromText('รหัสอ้างอิง A5a66273bc35e43a9')).toBeNull()
  })

  it('no longer captures a bare "อ้างอิง" label without the รหัส prefix', () => {
    expect(extractRefCodeFromText('อ้างอิง: A5a66273bc35e43a9')).toBeNull()
  })

  it('still captures the per-transaction "เลขที่อ้างอิง" label (not dropped)', () => {
    expect(extractRefCodeFromText('เลขที่อ้างอิง: 260602205835311007')).toBe('260602205835311007')
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

  it('falls back to the printed เลขที่รายการ when the QR carries no reference (MAKE/KBank)', () => {
    // MAKE slip QR: EMVCo, no tag 62-05 → extractRefCodeFromQR returns null.
    const makeText = `${sampleText}\nเลขที่รายการ: 015062598765432`
    const qr = '00020101021130xxYYzz6304ABCD' // EMVCo, no tag 62 sub-05
    const r = extractFields(makeText, qr, null)
    expect(r.refCode.value).toBe('015062598765432')
    expect(r.refCode.confidence).toBeGreaterThan(0)
    expect(r.refCode.confidence).toBeLessThan(0.9) // OCR-derived, lower trust than QR
  })

  it('leaves refCode null when neither QR nor OCR carry a reference', () => {
    const r = extractFields(sampleText, '00020101021130xxYY6304ABCD', null)
    expect(r.refCode.value).toBeNull()
  })

  it('preserves rawTextDebug only in development', () => {
    // NODE_ENV is 'test' in vitest, so rawTextDebug should be undefined
    const r = extractFields(sampleText, null, null)
    expect(r.rawTextDebug).toBeUndefined()
  })
})
