# REVIEW-INBOX

Correction briefs from pm-desk. Newest on top.
Dev session: work through OPEN items, mark each `[x]` and note what was done, then ask pm-desk for a re-review.

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
