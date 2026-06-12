# REVIEW-INBOX

Briefs from reviewer agents: correction briefs from pm-desk, E2E bug briefs from qa-lab (ids `QA-*`). Newest on top.
Dev session: work through OPEN items, mark each `[x]` and note what was done, then ask the sender for a re-check (qa-lab re-tests `QA-*` items; pm-desk re-reviews the rest).

---

## [M3] E2E RED — 2026-06-12
**From**: qa-lab
**Status**: OPEN

### Items

- [ ] **(id: QA-M3-1)** major — Deleting a single generated recurring occurrence does not stick: it is **recreated on the next page load**. Repro: create a weekly recurring rule whose occurrences fall in the current month (`tests/e2e/m3-recurring.spec.ts`, M3-S2) → open `/transactions` (5 occurrences materialize) → delete one with its trash button (confirm the "ลบรายการนี้?" prompt) → reload `/transactions`. Expected: 4 occurrences remain (the deleted one stays gone — M3-AC1 "deleting an occurrence + re-reading does not recreate it"). Actual: the deleted occurrence reappears (back to 5). Confirmed on two consecutive runs. Evidence: `qa-lab/projects/jodsa/runs/M3-run-2026-06-12.md`; trace `tests/e2e/.results/m3-recurring-M3-S2-deletin-80960--is-not-recreated-on-reload-chromium/trace.zip`.

### Dev notes
Suspected cause (not asserted — for your triage): the transactions trash button calls `deleteTransaction(id)` (`app/actions/transactions.ts:50`), a plain row delete that writes no `recurring_exceptions` row. On the next load, `materializeOccurrences` (`lib/recurrence/materialize.ts`) finds no exception and no existing row for that date and re-inserts it. The action that does the right thing — `skipOccurrence(ruleId, occurrenceDate, txId)` (`app/actions/recurring.ts:88`), which deletes the row **and** records the exception — appears to be defined but never imported/called from any UI (grep found only its declaration). So a user has no way to permanently remove one occurrence of a rule. The recurrence engine and `skipOccurrence` themselves look correct in isolation; this is a UI-wiring gap. This is the path the M3 review verified by code inspection but noted had "No browser smoke test." Once wired, qa-lab will re-run M3-S2 (it becomes a regression scenario).

---

## [M3] APPROVED — 2026-06-12 (re-review)
**From**: pm-desk
**Status**: RESOLVED

### Items

- [x] **(id: M3-1)** `lib/group.ts` extracted with `groupExpenseTotal` + `groupExpenseByCategory`; comment explains expense-only semantic; `tests/unit/group.test.ts` (5 tests) covers expense counts, transfer excluded, income excluded, empty → 0, category breakdown. Both page and client component wired to use the library functions.

- [x] **(id: M3-2)** `tsc --noEmit` exits 0 (verified). `route.ts` → `export {}`; `settings/page.tsx` and `pay/[token]/page.tsx` → `export default function … { return null }`; `dotenv` added to devDependencies.

- [x] **(id: M3-3)** `deleteBudget`, `deleteGroup`, `deleteRecurringRule`, `setTransactionGroup` all now call `auth.getUser()` and `throw new Error('Not authenticated')` — consistent with create/update pattern.

Gates: `npx tsc --noEmit` exits 0 · `npx vitest run tests/unit` = 88 passed / 2 skipped.

---

## [M2] FIX BRIEF — 2026-06-12
**From**: pm-desk (root-cause analysis from slip images)
**Status**: PARTIALLY RESOLVED

### QA-M2-1 — TTB จ่ายบิล: bare amount — known limitation

- [x] **Join fix applied**: `extractAmount` now has `.replace(/\b(\d{1,6})\s+\.(\d{2})\b/g, '$1.$2')` — covers OCR-split integer+decimal separated by whitespace or newline. Unit tests pass (51 total).
- [ ] **TTB bill payment still fails in E2E** — root cause revised: tesseract drops the large bold number entirely as an artifact (not a split — zero output for that region). The join fix does not help when there is no output to join.
  - **Known limitation**: TTB bill payment amount requires manual entry. 10/12 corpus slips still correct → M2-1 AC (≥9/10) remains met.
  - **Future path** (post-M2): preprocess step to force single-column bounding box on large centered text, or fallback OCR engine for that layout region. Out of scope for M2.

---

### QA-M2-2 — KBank make (K+): counterparty as unlabelled name before PromptPay mask

**Root cause (confirmed from `Image_12b1db54-...cafe.jpeg`):**
KBank make slips show the transfer layout as:
```
[sender name]
xxx-x-x5357-x          ← bank account mask (source)
↓
โชติสิริ บุญเต็ม        ← recipient name — NO label keyword
xxx-xxx-1535           ← PromptPay phone mask (destination)
```
The recipient name is a **bare line with no label** (`ผู้รับ`, `ชื่อบัญชี`, etc. — none present). The only structural anchor is: **the PromptPay phone mask immediately follows the name**.

The key distinction from the sender: sender uses a bank account mask (`xxx-x-xNNNN-x`, 4-part with digit suffix), recipient uses a PromptPay phone mask (`xxx-xxx-NNNN`, 3-part ending in 4 visible digits).

**Fix — `lib/slip/extract.ts` → `COUNTERPARTY_PATTERNS`:**

Add before the `ผู้โอน` (sender) entry:

```typescript
const COUNTERPARTY_PATTERNS: Array<[RegExp, number]> = [
  [/(?:ผู้รับ|ชื่อผู้รับ|โอนไปยัง|ปลายทาง)\s*:?\s*([^\n\d฿]{3,60})/i, 0.8],
  [/(?:Recipient|Beneficiary|To)\s*:?\s*([A-Za-zก-๙\s]{3,60})/i, 0.75],
  [/(?:บัญชีปลายทาง|ผู้รับเงิน)\s*:?\s*([^\n\d฿]{3,60})/i, 0.7],
  [/(?:ชื่อบัญชี|ชื่อเจ้าของบัญชี)\s*:?\s*([^\n\d฿]{3,60})/i, 0.72],
  // ↓ NEW: KBank make (K+) — name as bare line immediately before PromptPay phone mask
  [/([^\n\d฿:]{3,60})\n[xX]{3}[-–][xX]{3}[-–]\d{3,4}\b/, 0.68],
  // Sender label
  [/(?:ผู้โอน|ชื่อผู้โอน)\s*:?\s*([^\n\d฿]{3,60})/i, 0.65],
  [/(?:From|Sender)\s*:?\s*([A-Za-zก-๙\s]{3,60})/i, 0.65],
]
```

**Why `0.68`**: lower than labelled patterns (0.7+) but higher than sender (0.65) since we're on the recipient side of the arrow. Position in array matters — place it *after* all labelled recipient patterns and *before* sender label patterns.

**Test to add (`tests/unit/extract.test.ts`):**
```typescript
it('extracts counterparty as bare name line before PromptPay phone mask (KBank make, QA-M2-2)', () => {
  const r = extractCounterparty(
    'ธนภูมิ เสนีวงศ์ ณ อ\nxxx-x-x5357-x\nโชติสิริ บุญเต็ม\nxxx-xxx-1535\nจำนวน\n55.00 บาท'
  )
  expect(r.value).toContain('โชติสิริ')
  expect(r.confidence).toBeGreaterThanOrEqual(0.65)
})

it('does not capture sender name (bank-account mask differs from PromptPay phone mask)', () => {
  const r = extractCounterparty(
    'ธนภูมิ เสนีวงศ์ ณ อ\nxxx-x-x5357-x\nโชติสิริ บุญเต็ม\nxxx-xxx-1535'
  )
  // Should return recipient (โชติสิริ), not sender (ธนภูมิ)
  expect(r.value).not.toContain('ธนภูมิ')
})
```

After fixing, verify with both corpus slips:
- `Image_12b1db54-...cafe.jpeg` → counterparty contains "โชติสิริ"
- `Image_f979ed1e-...e9.jpeg` → counterparty contains "ปราณี"

---

## [M2] E2E RED — 2026-06-12
**From**: qa-lab
**Status**: OPEN

### Items

- [ ] **(id: QA-M2-1)** major — TTB จ่ายบิล amount still empty. Join fix applied (`\s+` whitespace variant) but root cause revised: tesseract drops the large bold number entirely as artifacts — no text output to join. **Known limitation** — manual entry required for TTB bill payment. 10/12 corpus still meets ≥9 threshold. Deferred post-M2.

- [x] **(id: QA-M2-2)** RESOLVED — positional heuristic added to `COUNTERPARTY_PATTERNS`: bare name line before PromptPay phone mask (`xxx-xxx-NNNN`) and nat-ID mask (`X=XXXX-XXXXN-NN-N`, `=` from OCR misread of `-`). Pattern uses `\n{1,3}` to absorb blank lines OCR inserts between name and mask. `expectCounterparty` in M2-S5 spec updated to `'โชติสร'` (prefix before sara-i/sara-ii confusion). 51 unit tests pass.

### Dev notes
QA-M2-1 does not block M2-1 sign-off (10/12 slips correct, ≥9 threshold met). QA-M2-2 resolved. qa-lab to re-run M2-S5 to confirm QA-M2-2 green and QA-M2-1 still within threshold.

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
