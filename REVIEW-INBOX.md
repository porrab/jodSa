# REVIEW-INBOX

Briefs from reviewer agents: correction briefs from pm-desk, E2E bug briefs from qa-lab (ids `QA-*`). Newest on top.
Dev session: work through OPEN items, mark each `[x]` and note what was done, then ask the sender for a re-check (qa-lab re-tests `QA-*` items; pm-desk re-reviews the rest).

---

## [M2] APPROVED — 2026-06-09 (final)
**From**: pm-desk
**Status**: RESOLVED

### Items

- [x] **(id: M2-12)** Sara am Unicode mismatch — เป๋าตัง amount still null in real app. **Root cause:** tesseract OCR outputs sara am as `ํา` (U+0E4D + U+0E32, decomposed) but every pattern in `extractAmount` and `extractDateTime` uses `ำ` (U+0E33, precomposed sara am). They are visually identical but byte-different — regex never matches. Confirmed from rawTextDebug: `จํานวนเงินที่ชําระ` (decomposed) vs pattern `จำนวนเงินที่ชำระ` (precomposed). **Fixed:** Added `.replace(/ํา/g, 'ำ')` to `normalizeThaiDigits` — all three extract functions call it so the fix applies everywhere. Test added with decomposed input `จํานวนเงินที่ชําระ`; 44/44 pass.

### Dev notes
Single-line fix in `normalizeThaiDigits` (or a new `normalizeThai` function). After this, เป๋าตัง should extract amount, bank code (`เบาตง`/G-Wallet won't match a bank code which is expected), and datetime `3 มิย. 2569 18:48`. Also check whether M2-9b counterparty is affected by the same mismatch — `ชํา` in OCR text may use same decomposed form.

---

## [M2] CHANGES NEEDED (re-review 3) — 2026-06-09
**From**: pm-desk
**Status**: OPEN

### Items verified by OCR runner against real slip images

- [x] **(id: M2-11b)** เป๋าตัง AMOUNT_PATTERNS still incomplete. `ยอดชำระ` matches the prefix of `ยอดชำระทั้งหมด` but `\s*[฿:]?\s*` then expects a digit/฿, while `ทั้งหมด` is next → match fails. Same for `จำนวนเงินที่ชำระ` — `จำนวนเงิน` prefix matches but `ที่ชำระ` blocks digit capture. **Fixed:** Added `จำนวนเงินที่ชำระ` before `จำนวนเงิน` and `ยอดชำระทั้งหมด` before `ยอดชำระ` in `AMOUNT_PATTERNS` so longer forms match first. Tests added; 43/43 pass.

- [x] **(id: M2-8b)** TTB bank detection still wrong. `inferBankCode` iterates through `BANK_PATTERNS` in array order (SCB → KBANK → KTB → … → TTB). For a TTB→KBANK transfer, both `ttb` and `KBANK` appear in the first 300 chars, but KBANK is checked and matched before TTB — regardless of which appears earlier in the text. **Fixed:** Header scan now tracks `{code, index}` for every pattern and returns the one with the lowest match index (earliest position). Test added for TTB-issuing/KBANK-destination scenario; 43/43 pass.

- [ ] **(id: M2-9b)** Counterparty still null in manual test. M2-9 added `ผู้โอน`/`ชื่อโอน`/`ชื่อบัญชี` patterns. If names appear without a label (raw name line in slip layout), no pattern fires. **Fixed =** Re-run in real app (with preprocessing). If still null, add a positional heuristic (name line after account number) or confirm OCR text shows a label that current patterns cover.

- [x] **(id: M2-10b)** Datetime time component re-verify. `findTimeAfter` looks 150 chars after date match — correct approach. But Thai month abbreviations with spaces (`พ . ค .`) from low-quality OCR won't match the regex. **Fixed:** `extractDateTime` now applies `.replace(/([ก-๙])\s*\.\s*([ก-๙])/g, '$1.$2')` to collapse inter-char OCR spaces. Month patterns in `p2` also changed to `\s*\.\s*` around each dot and trailing `\s*` before year, with `rawMonth.replace+trim()` normalising the captured group for `THAI_MONTHS` lookup. Test added for `"15 พ . ค . 2567 14:30"`; 43/43 pass. Re-confirm with real app.

### Dev notes
M2-11b and M2-8b are confirmed code bugs (visible from raw OCR text). M2-9b and M2-10b need re-testing in the real app with preprocessing pipeline active — the OCR runner used raw images (no preprocessing), so those results are unreliable. Fix M2-11b and M2-8b first.

---

## [M2] CHANGES NEEDED (re-review) — 2026-06-09
**From**: pm-desk
**Status**: OPEN

### Closed from prior brief
- [x] M2-2 — no image upload ✅
- [x] M2-4 — soft-dedup warning ✅
- [x] M2-5 — tesseract comment ✅

### Items

- [x] **(id: M2-6)** False positive ref_code duplicate — some never-imported slips trigger "รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)". **Fixed:** `extractRefCodeFromQR` now only uses EMVCo tag 62 sub-field 05 (Reference Label) for PromptPay QRs — account numbers and PromptPay IDs in other fields are no longer treated as ref_code. Non-EMVCo fallback now requires 15+ digit sequences (transaction refs), avoiding 10–12 digit account numbers. Test: EMVCo static QR without tag 62 now returns null.

- [x] **(id: M2-7)** Dedup not reliable for readable-QR slips — 2nd import of same slip sometimes passes. **Fixed:** `checkNullRefDedup` now checks ALL same-amount-account-time transactions (removed `.is('ref_code', null)`). If the found duplicate has a `ref_code` (first import was via successful QR), the confirm form hard-blocks with "รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)" instead of showing a soft warning — so all retries after the first will fail.

- [x] **(id: M2-8)** Bank detection wrong: KTB slip detected as TTB. **Fixed:** `inferBankCode` now checks the first 300 chars of OCR text (slip header) first with higher confidence (0.95), falling back to full-text at lower confidence (0.75). This prevents the destination bank name (TTB) mentioned in the body from overriding the issuing bank (KTB) in the header. Test added.

- [x] **(id: M2-9)** Counterparty name (ชื่อผู้โอน/ผู้รับ) OCR'd correctly but not populated in confirm form. **Fixed:** Added `COUNTERPARTY_PATTERNS` entries for `ผู้โอน`, `ชื่อผู้โอน` (sender label — covers income slips) and `ชื่อบัญชี` / `ชื่อเจ้าของบัญชี` (account name label — covers KBank-style slips). The `SlipConfirmForm` pre-fill was already correct; the extraction patterns were missing. Tests added.

- [x] **(id: M2-10)** Time value wrong in datetime input. **Fixed:** Extracted a `findTimeAfter()` helper that searches up to 150 chars after the date match for `HH:mm` or `HH.mm` (period separator). This handles time printed on a separate line from the date, which the old inline regex missed. Lower confidence (0.7/0.72) returned when no time is found so the field shows amber. Tests added for separate-line and period-separator cases.

- [x] **(id: M2-11)** เป๋าตัง (PromptPay) amount extraction wrong. **Fixed:** Added `AMOUNT_PATTERNS` entry for `ยอดโอน|ยอดเงินที่โอน|เงินที่โอน|ยอดชำระ|ยอดที่ชำระ` at confidence 0.85, covering เป๋าตัง and other PromptPay wallet layouts that use these labels instead of `จำนวนเงิน`. Tests added.

### Dev notes
M2-6 and M2-7 are likely related (same QR field extraction bug). Fix M2-6 first — if the wrong QR field is being used as ref_code, fixing it will likely stabilise M2-7 as well. M2-8/M2-9/M2-10/M2-11 are independent extract.ts fixes. TrueMoney and Make by KBank are out-of-scope for this milestone.

---

## [M2] CHANGES NEEDED — 2026-06-05
**From**: pm-desk
**Status**: OPEN

### Items

- [ ] **(id: M2-1)** Accuracy test — run ≥10 real slips through the import flow, record expected vs. actual amount for each. **Why:** "amount correct on ≥9 of any 10" is the central M2 criterion; unit tests cover synthetic OCR text, not real images. **Fixed =** ≥9/10 slips show correct amount in the confirm form pre-fill. Report the per-slip results (bank, expected, actual, pass/fail).

- [ ] **(id: M2-2)** DevTools Network check — upload a real slip and confirm no request body contains image bytes. **Why:** "no image upload" is a privacy guarantee that must be externally verified. **Fixed =** Screenshot or description: Network tab shows only the Server Action POST with text fields (amount, datetime, counterparty, etc.) — no binary/image payload.

- [ ] **(id: M2-3)** Duplicate QR slip rejection — import the same slip (readable QR) twice. **Why:** AC requires demonstrating rejection, not just that the error handler exists. **Fixed =** Second import returns "รายการนี้มีอยู่แล้ว (ref_code ซ้ำ)" and creates no duplicate row in the transactions table.

- [ ] **(id: M2-4)** Soft-dedup warning — upload a null-ref slip, then upload same amount/account again within 5 minutes. **Why:** AC requires demonstrating the warning, not just that the code path exists. **Fixed =** Amber near-duplicate warning appears before the second save; user can cancel or proceed.

- [x] **(id: M2-5)** Document tesseract-on-main-thread deviation. Added 6-line block at top of `workers/slip.worker.ts` and 5-line comment above the `await import('tesseract.js')` call in `import-client.tsx`. Both explain: tesseract.js v5 spawns its own WASM worker; nesting it in a Web Worker breaks Chrome/Safari; OCR is still non-blocking; privacy is preserved because only the preprocessed ImageData (not original file bytes) reaches tesseract.

### Dev notes
Code quality is strong: QR → preprocess → OCR pipeline correct, color-then-grayscale order correct, worker terminates in both paths, rawTextDebug dev-only. These 5 items are all manual tests + 1 comment — no code changes needed unless M2-1 reveals accuracy issues.

---

## [M1] APPROVED — 2026-06-05 (re-review)
**From**: pm-desk
**Status**: RESOLVED

### Items

- [x] **(id: M1-1)** RLS test `user_id: ''` bug — fixed. Test passes 2/2 against live Supabase.
- [x] **(id: M1-2)** RLS integration test ran and passed — 2/2 green (run: 2026-06-05 02:35:52, duration 4.18s).
- [x] **(id: M1-3)** Manual smoke test passed — User B sees zero of User A's data; balances and sync confirmed.
- [x] **(id: M1-4)** recharts pinned to `"^3.8.1"` in package.json ✓
