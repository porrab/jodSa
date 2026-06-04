---
name: slip-parser
description: >
  Parse a Thai bank/PromptPay payment slip image entirely client-side into a
  structured transaction. Use whenever implementing or modifying the slip-reading
  pipeline — QR decoding, tesseract.js OCR (tha+eng), field extraction heuristics,
  confidence scoring, image preprocessing, or the income-by-recipient-name guess.
  Do NOT use for server-side parsing, paid vision APIs, or non-Thai receipts.
---

# Slip Parser

Turn a slip image into `ParsedSlip` **without ever uploading the image**. All work
happens in `workers/slip.worker.ts`; only the resulting JSON leaves the device.

## Pipeline (in order)

1. **Preprocess** (canvas, in-worker): downscale longest edge to ~1600px, convert
   to grayscale, increase contrast. Optionally crop to the central region for the
   amount. Large phone photos must be shrunk before OCR or it is slow and memory-heavy.
2. **QR decode** (`jsqr` / `@zxing/library`): Thai slips carry a verification QR.
   It reliably yields a **transaction reference (`ref_code`)** and often a **bank
   code (`bank_code`)**. Treat the QR payload as the source of truth for `ref_code`.
   ⚠️ The QR does **NOT** reliably contain the amount — do not depend on it for amount.
3. **OCR** (`tesseract.js`, langs `tha+eng`): extract text. Amounts are Arabic
   numerals and OCR well; Thai names/merchant text are lower-confidence.
4. **Field extraction heuristics** (`extract.ts`): pull `amount`, `datetime`,
   `counterparty` from the OCR text using the per-bank patterns below.
5. **Income-name heuristic**: if the parsed recipient name fuzzy-matches the user's
   configured `display_name`, set `suggestedType = 'income'`; otherwise `'expense'`.
6. **Confidence**: attach a 0–1 confidence per field. Low-confidence fields must be
   visually flagged in the confirm form. **Always require user confirmation** — never
   auto-commit a parsed slip.

## Output schema

```ts
type FieldConfidence<T> = { value: T | null; confidence: number };
interface ParsedSlip {
  amount: FieldConfidence<number>;        // satang (integer)
  datetime: FieldConfidence<string>;      // ISO 8601, Asia/Bangkok
  counterparty: FieldConfidence<string>;
  refCode: FieldConfidence<string>;       // from QR primarily
  bankCode: FieldConfidence<string>;
  suggestedType: 'income' | 'expense';
  rawTextDebug?: string;                  // dev-only, never persisted
}
```

## Per-bank field cues (extend with your labeled corpus)

| Bank | Amount label cues | Date format cues | Notes |
|------|-------------------|------------------|-------|
| SCB | "จำนวนเงิน" / "Amount" + `฿`/`THB` | `dd MMM yy HH:mm` (th month abbr) | QR present |
| KBank (KPlus) | "จำนวน" near baht symbol | `dd/MM/yy HH:mm` | QR present |
| KTB (Krungthai) | "จำนวนเงิน" | `dd MMM yyyy` | QR present |
| BBL (Bangkok Bank) | "Amount"/"จำนวน" | `dd-MM-yyyy HH:mm` | QR present |
| PromptPay | amount near recipient | varies | always QR; ref_code reliable |

## Normalization rules
- Strip thousands separators; accept Thai digits (๐–๙) and map to 0–9.
- Parse amount to **satang**: `baht * 100`, rounding to nearest satang.
- Resolve dates in **Asia/Bangkok**; if year is Buddhist (พ.ศ.), subtract 543.

## When NOT to use
- Server-side OCR or any paid vision API (out of scope for MVP).
- Non-Thai or non-bank receipts (no patterns defined).
- Anything that requires the raw image to leave the device.

## Hard rules
- The image object is discarded immediately after producing `ParsedSlip`.
- Never POST the image. Verify in DevTools Network tab that only JSON is sent.
- Degrade gracefully: if QR fails, continue with OCR and leave `refCode` null.
