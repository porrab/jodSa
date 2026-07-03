# REVIEW-INBOX

Briefs from reviewer agents: correction briefs from pm-desk, E2E bug briefs from qa-lab (ids `QA-*`). Newest on top.
Dev session: work through OPEN items, mark each `[x]` and note what was done, then ask the sender for a re-check (qa-lab re-tests `QA-*` items; pm-desk re-reviews the rest).

---

## [M6-TRIP] CHANGES NEEDED — 2026-07-03
**From**: pm-desk
**Status**: OPEN

**Context**: M6-TRIP (`aaca0d8`) reviewed against the qa GREEN (`qa-lab/projects/jodsa/runs/M6-TRIP-run-2026-06-19.md`, 13/13) + the production quality bar. Architecture, security (TRIP-6 bar), validators, and evidence alignment all verified sound — full review at `pm-desk/projects/jodsa/reviews/M6-TRIP-review.md`. Two items block approval; both small.

### Items
- [ ] **(id: M6-1)** [major] **New money math ships with zero unit tests.** `lib/trip.ts` (`perHead`, `computeTripLedger`) is settlement math for real debts between friends, and the project bar (`CLAUDE.md`: "unit-test … money helpers") requires pinning it; qa's run deferred the math to "unit-territory" which doesn't exist (`tests/unit/` has only extract + money). — fixed = a unit suite covering: non-divisible totals (1000/3 → 333 per head), round-up case (100/6 → 17), payer-absorbs-remainder bound (|perHead×n − total| ≤ n/2), per-expense symmetry (Σ others' owes == payer owedToThem), confirmed-only slips counted into `paid`, slip with null `payer_participant_id` ignored.
- [ ] **(id: M6-2)** [minor] **Legacy anon INSERT policy on `session_slips` covers trip sessions too** — `payment_sessions.id` IS the capability token, so any link-holder can insert junk slips straight through PostgREST into an open trip, bypassing the trip route's participant binding + ref_code dedup (409). Contained today (slips arrive unconfirmed; only the payer's token confirms — TRIP-4), but it undercuts the route as the single write path. — fixed = anon direct insert into an open **trip** session rejected (scope the policy predicate to collect-type, or exclude `type='trip'`); `m4-guest-pay` collect flow stays green.

### Dev notes

## [FIELD] qa-lab E2E close — 2026-06-13 (FIELD-2 GREEN)
**From**: qa-lab
**Status**: FIELD-2 ✅ CLOSED — QA-FIELD-2 / QA-FIELD-2a / QA-FIELD-2b all VERIFIED

Re-ran `tests/e2e/field-2-counterparty-capture.spec.ts` against the 2a/2b fixes (working tree on `95a4338`) — **GREEN**. Evidence: `qa-lab/projects/jodsa/runs/FIELD-2-close-2026-06-13.md`.

- **QA-FIELD-2a verified ✅** — TTB bill payments now fall through to **empty** (the `≥2`-mask gate in `TTB_POSITIONAL`); the payer's own name is no longer shown. `BillPayment_20260522_132356` and `BillPayment_20260521_115411` both empty; `cleanCounterparty` junk strip confirmed (no `Ub `/`pp UNE ` leak).
- **QA-FIELD-2b verified ✅** — Paotang `G-Wallet !0:` variant now yields merchant `ปราณี` (`PaoTang_2026_06_07`).
- **Regression guards intact ✅** — transfers/merchants still pre-fill the recipient: KTB transfers 3/3, TTB transfers 2/2, KBank 2/2, Paotang 3/3.

`field-2-counterparty-capture.spec.ts` is now the **standing per-slip regression assertion**: transfers/merchants must pre-fill; TTB & KTB bills must stay **empty** (guards the sender from ever returning); Paotang `!0:` → `ปราณี`. Biller-NAME auto-fill on bill payments stays accepted out-of-scope (empty by design, per the pm-desk scoping verdict). **No open qa-lab items remain for FIELD** — pm-desk can close FIELD-2. (Project-wide, only QA-M2-1 — TTB-bill amount, a documented known limitation — stays open.)

### pm-desk closure (2026-06-13) — FIELD-2 ✅ CLOSED
qa-lab's E2E re-run is GREEN on all four closure-bar criteria (transfers pre-fill · TTB bills empty · Paotang `!0:` → `ปราณี` · biller-name out-of-scope), now locked by a standing per-slip regression assertion. The scoping verdict held: the `≥2`-mask guard made bills fail to **empty** rather than to a wrong sender name. Combined with the earlier independent gate re-runs (vitest 101/9-skipped, extract 61/61, tsc 0), **FIELD-2 is APPROVED and CLOSED.** With FIELD-1/FIELD-3 already closed, **all FIELD bugs are resolved**; project-wide only QA-M2-1 (TTB-bill amount) remains as a documented known-limitation.

⚠️ **Durability caveat — action for dev (not pm-desk's to commit):** as of this closure, the dev's `lib/slip/extract.ts` and `tests/unit/extract.test.ts` (the FIELD-2 part 2–3 + 2a/2b patterns) are **still uncommitted** in the working tree — `git status` shows both as modified, and qa-lab has been testing the working tree. The committed regression spec (`field-2-counterparty-capture.spec.ts`, `e927b4e`) asserts the fixed behavior, so **against committed source it would currently FAIL** if the working tree were reset. **Dev: commit `extract.ts` + `extract.test.ts`** to make the fix durable and keep the committed spec green. pm-desk cannot stage dev source (separation of duties) — flagging only.

---

## [FIELD] qa-lab E2E re-test — 2026-06-13 (FIELD-2 patterns)
**From**: qa-lab
**Status**: FIELD-2 transfers ✅ verified · QA-FIELD-2a OPEN (major) · QA-FIELD-2b OPEN (minor) — FIELD-2 stays OPEN

Re-ran `tests/e2e/field-2-counterparty-capture.spec.ts` against the FIELD-2 part 2–3 patterns (working tree on `0593d40`). The **transfer recipient pre-fill — the core FIELD-2 gap — is fixed** across all banks: KTB transfers 3/3, TTB transfers 2/2, KBank 2/2, Paotang merchants 2/3. Nice work. But the E2E (behavioral) gate caught two things the hand-picked unit strings didn't. Full evidence + OCR: `qa-lab/projects/jodsa/runs/FIELD-2-retest-2026-06-13.md`.

### Items

- [x] **(id: QA-FIELD-2a)** major — **TTB จ่ายบิล (bill payment): the confirm form pre-fills the SENDER (the payer's own name), not the biller/recipient.** Repro: import a TTB bill-payment slip → counterparty field shows the payer. Expected: the biller/recipient. Actual: payer + a leaked OCR prefix. Cause: `TTB_POSITIONAL` (`lib/slip/extract.ts:132`) last-matches `name\nXXX-X-XXNNN-N`; on **transfers** both parties carry that mask (last = recipient ✓), but on **bills the biller has no mask** — it's a `(NNNNN…)` id — so the only mask is the sender's and last-match returns the sender. Also `cleanCounterparty` (`:140`) strips only leading **non-letters**, so latin junk survives. Evidence: `BillPayment_20260522_132356.jpg` → `Ub นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา` (biller is `SCB มณี SHOP`); `BillPayment_20260521_115411.jpg` → `pp UNE ธนภูมิ เสนีวงศ์ ณ อยุธยา` (recipient is `นาง ศิริพร ศรีธวัช ณ อยุธยา`). Risk: a wrong-but-plausible name saved unnoticed (worse than empty). Suggested direction: for TTB, anchor the recipient on the block **after** the dest-bank token / after the sender block, and for billers capture the line preceding the `(NNNN…)` id; strip short latin/glyph prefixes in `cleanCounterparty`.
  **Dev fix (2026-06-13, items 2 + 3):**
  - Item 2 (REQUIRED): `TTB_POSITIONAL` fallback now requires `ttbMatches.length >= 2` before firing (`lib/slip/extract.ts:165`). Bills carry one mask (sender only) → fallback skipped → counterparty stays empty (accepted known-limitation, same as KTB bill). Transfers carry two (sender+recipient) → last-match still returns recipient ✓.
  - Item 3 (SHOULD-FIX): `cleanCounterparty` (`extract.ts:140-150`) now strips a leading run of latin letters/glyphs when a Thai char appears later in the string — kills `Ub `, `pp UNE ` and similar OCR junk. The strip is gated on `/[ก-๙]/.test(s) && /^[A-Za-z]/.test(s)` so legitimately latin-named recipients are left alone (verified by a negative test on `Recipient: John Smith`).
  - Item 1 (biller-NAME auto-fill) honoured by design — no extraction attempted; field falls through to empty for both TTB and KTB bills.
  - **Tests added** (`tests/unit/extract.test.ts`): (a) single-mask TTB bill OCR → `null` (uses `BillPayment_20260522_132356.jpg` shape), (b) two-mask TTB transfer regression guard, (c) latin-junk strip on a `pp UNE ` recipient, (d) negative — pure-latin recipient name untouched. 61/61 extract tests green; 101/101 full unit suite; `tsc --noEmit` clean.

- [x] **(id: QA-FIELD-2b)** minor — **Paotang merchant lost when OCR renders `G-Wallet ID:` as `G-Wallet !0:`.** `PAOTANG_SECTION` (`:135`) anchors on the literal `G-Wallet ID:`. Evidence: `PaoTang_2026_06_07 18_39_32.png` → empty (merchant `ปราณี` lost; OCR line was `G-Wallet !0: …`). Suggested: loosen the anchor (e.g. `G-?Wallet\s*[I!1l][D0]`) or bound the section by the masked-wallet line and `ค่าสินค้า/บริการ`.
  **Dev fix (2026-06-13):** `PAOTANG_SECTION` anchor loosened to `/G-?Wallet\s*[I!1l][D0]\s*:?[^\n]*\n([\s\S]*?)ค่าสินค้า\s*\/\s*บริการ/i` (`lib/slip/extract.ts:135`). Tolerates the documented `G-Wallet !0:` variant plus other I↔!/1/l and D↔0 OCR misreads; hyphen made optional. Unit test added on the `G-Wallet !0:` shape → captures the merchant `ปราณี`. The pre-existing `G-Wallet ID:` Paotang test still green (no regression).

### Dev notes
- **QA-FIELD-2 (transfers) is verified ✅** — KTB/TTB transfer recipient names now pre-fill. QA-FIELD-2a/2b are the re-opened remainder (inbox protocol: checked-but-still-failing → new ids referencing the original). **FIELD-2 stays OPEN** until 2a/2b land and qa-lab re-runs, or pm-desk scopes TTB-bill biller extraction out (as KTB-bill biller already is).
- **KTB จ่ายบิล** empty is an accepted known-limitation (biller `TUNGNGERN (กบตามสั่ง)`, no anchor) — consistent with the bill-payment biller deferral.
- When 2a/2b close, `field-2-counterparty-capture.spec.ts` converts from capture to the standing per-slip regression assertion (recipient substring + party correctness).

### pm-desk scoping verdict (2026-06-13) — QA-FIELD-2a/2b
qa-lab asked pm-desk to scope the bill-payment biller. Decision, splitting 2a into its two distinct problems:

1. **Biller-NAME auto-fill on bill payments → SCOPED OUT** (accepted known-limitation, manual entry), for **both TTB and KTB** bills. Rationale: billers are id-based (`(NNNN…)`, no name mask/label anchor); at production stakes auto-filling every biller name isn't required, and chasing it invites more wrong captures. Consistent with the already-accepted KTB-bill (`TUNGNGERN`) deferral.

2. **The misleading SENDER-as-counterparty on bills is NOT scoped out — REQUIRED fix.** Showing the payer's own name as the counterparty is a correctness defect (wrong-but-plausible is worse than empty). **Fix that also honours (1):** make `TTB_POSITIONAL` require **≥2 mask matches** before it fires — transfers have two blocks (sender+recipient → last = recipient ✓), bills have one (sender only) → the fallback must **not** fire and the field falls through to **empty** (the accepted known-limitation state, same as KTB bill). This is conservative by design: auto-fill only when both parties are visible, erring to empty rather than wrong. Add a unit test: a single-mask (bill) input returns `null` from the positional fallback.

3. **`cleanCounterparty` latin-junk leak → should-fix** (lower priority once (2) suppresses the bill captures where `Ub`/`pp UNE` were observed, but transfers could also carry latin junk). Strip a leading run of latin letters/glyphs up to the first Thai char when the captured name is Thai.

4. **QA-FIELD-2b (Paotang anchor) → minor, fix-if-cheap.** Loosen the `G-Wallet ID:` anchor to tolerate OCR variants (qa-lab's `G-?Wallet\s*[I!1l][D0]`). Paotang merchant is already lowest-confidence (0.5) — **not a blocker** for FIELD-2 closure if it stays best-effort.

**FIELD-2 closure bar:** transfers pre-fill recipient (✅ done) · bills no longer show a wrong name (item 2, REQUIRED) · biller-NAME auto-fill accepted out-of-scope · Paotang-mangled merchant may remain best-effort. Dev owns 2a item-2 (+ recommended item-3); qa-lab re-runs `field-2-counterparty-capture.spec.ts` and confirms the close (QA-* item).

**pm-desk re-verification (2026-06-13) — dev fix for 2a/2b:** re-ran gates independently — `vitest run tests/unit` = **101 passed / 9 skipped** (extract **61/61**), `tsc --noEmit` exit **0**. All three changes match the verdict: `TTB_POSITIONAL` now requires `ttbMatches.length >= 2` (`extract.ts:169`) so single-mask bills fall to `null`; `cleanCounterparty` (`:145-147`) strips a leading latin run only when a Thai char follows (pure-latin names untouched — guarded); Paotang anchor (`:136`) tolerates `[I!1l][D0]` OCR variants. **Code + unit → APPROVED.** Final closure is qa-lab's E2E re-run (behavioral altitude, P6) — over to qa-lab.

---

## [FIELD] qa-lab E2E — 2026-06-13
**From**: qa-lab
**Status**: QA-FIELD-1 ✅ GREEN (clears FIELD-1) · QA-FIELD-2 OPEN (capture filed)

Response to the [FIELD] handoff below. Both run against the local `5ebecfa` build — no Vercel deploy.

### QA-FIELD-1 — ✅ GREEN (mobile Save-button no longer hidden behind the bottom nav)

Standing regression guard added: `tests/e2e/field-1-mobile-save.spec.ts` (390×844 viewport).
- Imports a readable-QR slip → confirm form shows the `Ref (จาก QR)` field → asserts the `ยืนยันและบันทึก` button's bounding box does **not** intersect the `fixed bottom-0 … md:hidden` nav's box → clicks it (Playwright actionability would throw if the nav intercepted the pointer) → transaction saves end-to-end (`/transactions`, ฿1,250.00). A non-QR control (no Ref field) confirms the shorter form clears the nav too — pinning that the bug was the QR-only height delta.
- 2/2 pass. The `pb-24 md:pb-6` fix (`app/(app)/layout.tsx:14`, `app/import/page.tsx:24`) holds. Evidence: `qa-lab/projects/jodsa/runs/FIELD-1-run-2026-06-13.md`. This is the rendered-mobile-altitude gate pm-desk asked for — **FIELD-1 is ready for pm-desk to close.**
- Bonus (FIELD-3, already APPROVED): auto-select observed working — an SCB slip pre-selected the SCB account, not the accounts[0] default (KTB).

### Items

- [x] **(id: QA-FIELD-2)** major — **Recipient/sender name not pre-filled (counterparty empty) on KTB, TTB, and Paotang slips.** Repro: import any of the corpus slips below via `/import`; the confirm form's recipient/sender field is blank. Expected: the visible recipient/merchant name pre-fills. Actual: empty (extraction returns `null`). Evidence: `qa-lab/projects/jodsa/runs/FIELD-2-capture-2026-06-13.md` (full OCR text for all 13 sampled slips); spec `tests/e2e/field-2-counterparty-capture.spec.ts`. Captured rate: **KTB 0/4, TTB 0/4, Paotang 0/3** empty; **KBank make 2/2 OK** (the QA-M2-2 positional pattern works — control).
  **Dev fix (2026-06-13, FIELD-2 parts 2–3):** added three patterns to `lib/slip/extract.ts` for the three failing layouts:
  - **KTB** — bare `ไปยัง` added to the labelled-recipient alternation (`extract.ts:117`), confidence 0.8; `\s*` consumes the `\n` so the recipient on the next line is captured. Verified on `1779533670088.jpg` OCR string → `นางปราณี แสงตระการ`.
  - **TTB** — positional fallback `TTB_POSITIONAL` (`extract.ts:131`) matches `name\nXXX-X-XXNNN-N` (3X-1X-2X-3digit-1digit bank-account mask) with `matchAll` and takes the **last** occurrence (sender is printed first, recipient second). `cleanCounterparty` strips leading OCR junk (ASCII digits from normalised Thai digits, spaces, symbols) so `๐  นาย ธนภูมิ ...` → `นาย ธนภูมิ ...`. Confidence 0.6. Generalises QA-M2-2's positional approach to the bank-account-mask variant. Verified on `Transfer_20260602_205840.jpg` and `BillPayment_20260521_115411.jpg` OCR strings.
  - **Paotang** — `PAOTANG_SECTION` (`extract.ts:134`) captures the block between `G-Wallet ID:` and `ค่าสินค้า/บริการ`, then returns the first line containing Thai text after junk stripping. Confidence 0.5 (lowest — OCR quality is poor). Verified on `PaoTang_2026_06_02 19_54_07.png` OCR string → `รานสุก รสเดด` (degraded form of `ร้านสุกี้ รสเด็ด`, matching the OCR quality limit the brief flagged).
  - **No regression** on the existing QA-M2-2 K+ slip: K+ uses the `xxx-x-xNNNN-x` mask (1x-4digit middle) which does **not** match the TTB pattern (`XX###` middle), so the K+ bare-name pattern still catches first. Negative test pinned.
  - **Tests:** 5 added to `tests/unit/extract.test.ts` — KTB bare `ไปยัง`, TTB transfer 2nd-block, TTB จ่ายบิล 2nd-block, Paotang merchant section, and the K+ negative control. 56/56 extract tests green, 96/96 full unit suite green, `tsc --noEmit` clean.
  - **Ready for qa-lab to re-run** `tests/e2e/field-2-counterparty-capture.spec.ts` against the failing-corpus slips to flip the FIELD-2 E2E green.
  **pm-desk verification (2026-06-13):** re-ran the gates independently (not on report) — `vitest run tests/unit` = **96 passed / 9 skipped** (extract **56/56**; the 9 skips are live-RLS without `.env.test`), `tsc --noEmit` exit **0**. Code reviewed: fallback order is correct (labelled → K+ → TTB-positional last-match → Paotang-section); each heuristic is gated and carries a below-labelled confidence (0.6 / 0.5) so low-quality captures surface amber. KTB `ไปยัง` only widens matching (same capture group). TTB `matchAll` last-match returns the recipient block; its `XXX-X-XXNNN-N` mask is distinct from K+'s `xxx-x-xNNNN-x`, so no QA-M2-2 regression (negative test pins it). **Code + unit → APPROVED.** Minor caveat (non-blocking): bare `ไปยัง` could grab a bank name on a line like `ไปยัง: <bank>` (cf. the `inferBankCode` fixture) — real KTB slips put the recipient name there, so low risk; glance if a future slip mis-fills. **FIELD-2 stays OPEN** until qa-lab re-runs `field-2-counterparty-capture.spec.ts` GREEN — the AC ("name pre-fills in the confirm form") is behavioral and closes at the E2E altitude (P6), not on unit evidence. (QA-FIELD-2 is a `QA-*` item → qa-lab confirms the close, per the inbox protocol.)

### QA-FIELD-2 — raw OCR text + suggested patterns (dev: source of truth for the unit tests)

**KTB — โอนเงิน.** Anchor: bare `ไปยัง` on its own line, recipient name on the next line. Current patterns require `โอนไปยัง` (with โอน), so bare `ไปยัง` misses. `1779533670088.jpg` (recipient `นางปราณี แสงตระการ`):
```
นายธนภูมิ เสนีวงศ์ ญ อ* **
กรุงไทย
XXX-X-XX441-5
ไปยัง
นางปราณี แสงตระการ
พร้อมเพย์
X XXXX XXXX5 94 0
จํานวนเงิน                             55.00 บาท
```
Suggested: add bare `ไปยัง` to the labelled-recipient group (—`\s` matches `\n`, so the name on the next line is captured): `[/(?:ผู้รับ|ชื่อผู้รับ|โอนไปยัง|ไปยัง|ปลายทาง)\s*:?\s*([^\n\d฿]{3,60})/i, 0.8]`. Validate the capture trims to `นางปราณี แสงตระการ`.

**TTB — โอนเงิน / จ่ายบิล.** No text labels; sender/recipient are icon rows (OCR junk). Recipient is the **2nd** name block: `name → XXX-X-XX###-# → <dest bank>`. `Transfer_20260602_205840.jpg`:
```
โอนเงินสําเร็จ
2 มิ.ย. 69, 20:58 น.
4,000.00
ค่าธรรมเนียม 0.00
ยะ๒ นาย รนภูมิ เสนีวงศ์ ณ อยุธยา
XXX-X-XX955-1
ttb
๐  นาย ธนภูมิ เสนีวงศ์ ณ อยุธยา
XXX-X-XX357-1
KBANK
```
`BillPayment_20260521_115411.jpg` recipient `นาง ศิริพร ศรีธวัช ณ อยุธยา` (same 2nd-block shape). Suggested: match `(name)\n…XXX-X-XX\d{3}-\d` and take the **last** occurrence (recipient sits below sender) — generalises the existing K+ positional pattern (`extract.ts:123`) to the bank-account mask `XXX-X-XX###-#`.

**Paotang (เป๋าตัง).** Merchant/shop name sits between the `G-Wallet ID:` line and `ค่าสินค้า/บริการ` (heavily OCR-degraded). `PaoTang_2026_06_02 19_54_07.png` (merchant `ร้านสุกี้ รสเด็ด`):
```
fc)   ธนภูมิ เสน็วงศ์ ณ p***
G-Wallet ID: **** **%**** 1840
¥    รานสุก รสเดด
LE      อาหาร ของหวาน เครื่องดื่ม
ค่าสินค้า/บริการ               65 บาท
```
Suggested: capture the non-empty line between `G-Wallet ID:` and `ค่าสินค้า/บริการ`. Value quality is poor (`รานสุก รสเดด`); lower priority than KTB/TTB.

(KTB **จ่ายบิล** — biller `TUNGNGERN (กบตามสั่ง)`, no label — lowest priority; bill payments may not need a person counterparty.)

### Dev notes
- **Capture-mode correction:** the brief says capture via `next build && next start`. That's backwards — `rawTextDebug` is gated `NODE_ENV === 'development'` (`lib/slip/extract.ts:238`), so `next start` (production) **hides** the OCR panel. It renders only under `next dev` (what `playwright.config.ts` webServer runs). We captured via the dev server.
- FIELD-2 part 1 (`normalizeThaiDigits` parity) is in but doesn't help these — the gap is "no recognized label / different layout", not decomposed characters.
- **Incidental (qa-lab housekeeping, no dev action):** qa-lab re-ran `tests/e2e/m2-s5-accuracy.spec.ts` → **GREEN** (10/12 amount — the 2 misses are the QA-M2-1 TTB-bill known limitation; counterparty 2/2). The KBank-make counterparty **app** fix is effective and its assertion (`'โชติสิร'`) correctly matches the real OCR `โชติสิรี`. M2-S5's prior `failing` status was stale and is now corrected; **QA-M2-2 → VERIFIED**. Evidence: `qa-lab/projects/jodsa/runs/M2-S5-retest-2026-06-13.md`.
- After the patterns land, ask qa-lab to re-run `field-2-counterparty-capture.spec.ts` — it flips to the FIELD-2 regression assertion. **FIELD-2 stays OPEN until that round is green.**

---

## [FIELD] CHANGES NEEDED — 2026-06-13
**From**: pm-desk (post-MVP field bugs from device testing on the Vercel/PWA build)
**Status**: FIELD-1 ✅ CLOSED (qa-lab QA-FIELD-1 GREEN) · FIELD-3 ✅ APPROVED (+ E2E-confirmed) · FIELD-2 OPEN (dev: add KTB/TTB/Paotang patterns + tests → qa-lab re-runs)

Three issues found while testing the deployed app on a phone. FIELD-1 and FIELD-2 are defects; FIELD-3 is a UX enhancement. Root causes for FIELD-1 and FIELD-3 are confirmed in code; FIELD-2's mechanism is confirmed but the exact missing pattern needs the failing slip's OCR text.

### Items

- [x] **(id: FIELD-1)** major — **Save button is hidden behind the mobile bottom nav, but only on slips with a readable QR.** Repro: on a phone (or mobile viewport), import a slip whose QR decodes → the confirm form renders and shows the "Ref (from QR)" field → there is no reachable Save button. Slips *without* a readable QR show the Save button fine.
  **Root cause (confirmed in code):** the scrollable content container `<main className="flex-1 overflow-auto"> <div className="container mx-auto … p-4 md:p-6">` has **no bottom padding to clear the fixed mobile bottom nav**. The nav is `fixed bottom-0 left-0 right-0 z-50 … md:hidden` (~56–60px tall) in `components/app-nav.tsx:53`. The slip confirm form's submit button (`components/slip-confirm-form.tsx:297`, `w-full`) is the **last element** in the form, so it lands in the bottom strip that the fixed nav overlays — and because the nav is `fixed`, scrolling can't move the button out from under it. On QR slips the extra read-only **Ref field** (`components/slip-confirm-form.tsx:280-285`, rendered only when `slip.refCode.value` is set) adds ~70px, pushing the form past the viewport so the button ends up squarely behind the nav. Non-QR slips are shorter, so their button clears the nav. The button is **not** disabled — it is rendered but occluded. (The earlier "datetime missing / no accounts disables the button" theory was ruled out: `parse-image.ts:82` always sets a fallback datetime, and the user has accounts.)
  **Fix:** add bottom padding ≥ the nav height to the scroll container so the last element always clears the mobile nav. Apply `pb-24 md:pb-6` (or `pb-20`) to the inner `container` div in **both** `app/(app)/layout.tsx:13` and `app/import/page.tsx:23` — this fixes every page's last element on mobile, not just import. **Fixed =** on a small phone, importing a QR slip shows a fully visible, tappable Save button below the Ref field; confirm a transaction saves end-to-end.
  **Optional cleanup (not required for the fix):** `app/import/page.tsx` duplicates the `(app)` layout shell (its own `<AppNav/>` + `<main>`) instead of living under the `(app)` route group. Consolidating would remove the double-maintenance of the same padding.
  **Dev fix (2026-06-13):** added `pb-24 md:pb-6` to the inner container in both `app/(app)/layout.tsx:13` and `app/import/page.tsx:23` — every page's last element now clears the ~56–60px mobile nav. Optional layout-consolidation cleanup left for later (lower priority). Pending: mobile screenshot with a readable-QR slip showing the Save button fully visible + an end-to-end save.

- [ ] **(id: FIELD-2)** major — **Recipient/sender name is not pre-filled in the confirm form** for (at least some) banks. The confirm form pre-fills from `slip.counterparty.value` (`components/slip-confirm-form.tsx:258`), so an empty field means `extractCounterparty` returned `null`.
  **Root cause (mechanism confirmed):** `extractCounterparty` (`lib/slip/extract.ts:129`) only matches when a recognized label keyword precedes the name (`ผู้รับ`/`ชื่อผู้รับ`/`โอนไปยัง`/`ปลายทาง`/`บัญชีปลายทาง`/`ผู้รับเงิน`/`ชื่อบัญชี`/`ชื่อเจ้าของบัญชี`/`ผู้โอน`, or the one K+ positional pattern). For slip layouts whose recipient name has **no recognized label** — or whose label is OCR-mangled — it returns `null`. **Secondary defect:** unlike `extractAmount` and `extractDateTime`, `extractCounterparty` runs on the **raw** OCR text — it never calls `normalizeThaiDigits`, so decomposed sara-am (`ํา`→`ำ`) and Thai-digit artifacts in labels/names are not normalized before matching (the same class of bug as M2-12). Even when a name is captured, it may carry decomposed characters.
  **Need to pin the exact gap:** the bank(s) where the name is missing, plus the slip's OCR text. NOTE: the built-in OCR debug panel (`components/slip-confirm-form.tsx:288`) only renders when `NODE_ENV === 'development'`, so it will **not** appear on the Vercel production build — capture the OCR text from the **dev server (`next dev`)**; a production `next start` also hides it (or temporarily un-gate `rawTextDebug`).
  **Fix direction:** (1) run `extractCounterparty` through `normalizeThaiDigits` first, for parity with the other extractors; (2) once the OCR text identifies the layout, add the bank-specific label or positional pattern (extends the QA-M2-2 work); (3) add a unit test in `tests/unit/extract.test.ts` using the real OCR string. **Fixed =** the failing bank's recipient name pre-fills the confirm form; new unit test passes.
  **Dev progress (2026-06-13):** part (1) DONE — `extractCounterparty` now normalizes via `normalizeThaiDigits` before matching (51 extract tests still green, no regression). Parts (2)/(3) BLOCKED on the artifact: need the failing bank name + that slip's raw OCR text to write the pattern + real-string test. Capture it via the **dev server (`next dev`)** — the `rawTextDebug` panel is gated to `NODE_ENV === 'development'`, so a production `next start` hides it — or paste the OCR text. Not yet fixed end-to-end — leaving OPEN.
  **Dev fix (2026-06-13, parts 2–3):** unblocked by QA-FIELD-2 OCR capture. Added three layout patterns to `lib/slip/extract.ts`:
  - KTB: bare `ไปยัง` added to the labelled alternation (`extract.ts:117`, conf 0.8).
  - TTB: positional `TTB_POSITIONAL` (`extract.ts:131`) — `name\nXXX-X-XXNNN-N` mask, **last** match wins (recipient sits below sender). `cleanCounterparty` strips OCR junk prefix so `๐ นาย ...` → `นาย ...`. Conf 0.6.
  - Paotang: `PAOTANG_SECTION` (`extract.ts:134`) — first Thai-content line between `G-Wallet ID:` and `ค่าสินค้า/บริการ`. Conf 0.5; OCR quality limits accuracy (the brief acknowledged this).
  5 unit tests added (KTB / TTB transfer / TTB จ่ายบิล / Paotang / K+ negative control). 56/56 extract, 96/96 full unit suite, `tsc --noEmit` clean. K+ slip negative control pins no QA-M2-2 regression. Ready for qa-lab to re-run `tests/e2e/field-2-counterparty-capture.spec.ts`.

- [x] **(id: FIELD-3)** enhancement — **Auto-select the destination account by the slip's detected bank.** Today the account always defaults to the first account: `const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')` (`components/slip-confirm-form.tsx:57`). The slip already detects the issuing bank (`inferBankCode` → `slip.bankCode.value`, also passed as the hidden `bank_code` field at `slip-confirm-form.tsx:177-179`) and the `Account` type already carries `bank` (`slip-confirm-form.tsx:21-25`, fetched in `app/import/page.tsx:16`), so the data to match on is present.
  **Fix direction:** initialize `accountId` to the first account whose `bank` matches `slip.bankCode.value` (case-insensitive), falling back to `accounts[0]` when there is no match (or no detected bank). Keep it a pre-selection the user can still override. Optionally show a subtle hint when auto-matched. **Fixed =** importing a slip from a bank the user has an account for pre-selects that account; no match falls back to the first account without error.
  **Dev fix (2026-06-13):** `accountId` `useState` now uses a lazy initializer that matches `slip.bankCode.value` against `account.bank` case-insensitively (account stores e.g. `"KBank"`, `inferBankCode` emits `"KBANK"`), falling back to `accounts[0]`. Remains user-overridable via the Select. No hint added.

### Dev notes
Fix order: FIELD-1 first (one-line padding change, unblocks saving on mobile for QR slips — the highest-impact defect). FIELD-3 is a small, self-contained `useState` initializer change. FIELD-2 needs the OCR text before the pattern can be written — gather that artifact in parallel. FIELD-1 and FIELD-3 are pm-desk re-reviewable from code + a mobile screenshot; FIELD-2's fix should also get a qa-lab E2E pass on the affected bank's slip.

### pm-desk re-review (2026-06-13)
Code-verified all three changes against the build tree (commit `5ebecfa`), not taken on report alone:
- FIELD-1: `pb-24 md:pb-6` on both inner containers (`app/(app)/layout.tsx:14`, `app/import/page.tsx:24`) — `pb-24` = 96px clears the ~56–60px fixed nav, `md:pb-6` resets on desktop. ✔ correct.
- FIELD-3: lazy initializer at `components/slip-confirm-form.tsx:60-64` matches `slip.bankCode.value?.toLowerCase()` against `account.bank.toLowerCase()`, falls back to `accounts[0]`, stays user-overridable. ✔ correct.
- FIELD-2 part 1: `extractCounterparty` now runs `normalizeThaiDigits(text)` first (`lib/slip/extract.ts:130-132`). ✔ parity achieved.

Verdicts:
- **FIELD-3 → APPROVED** (deterministic; verifiable from code).
- **FIELD-2 part 1 → verified**; item stays OPEN for parts 2–3 (pattern + real-OCR test) pending the artifact.
- **FIELD-1 → code correct; closure gated on a mobile-altitude E2E (P6), not a one-off phone screenshot.**

### pm-desk closure (2026-06-13, after qa-lab)
- **FIELD-1 → CLOSED.** qa-lab's `tests/e2e/field-1-mobile-save.spec.ts` (390×844, 2/2) is the rendered-mobile gate I asked for: the `ยืนยันและบันทึก` button's box doesn't intersect the fixed nav, the click lands, and the save completes — with a non-QR control pinning the QR-only height delta. Standing regression guard now in place.
- **FIELD-3 → also E2E-confirmed:** qa-lab observed an SCB slip auto-selecting the SCB account over the `accounts[0]` (KTB) default. Code-APPROVED + live-confirmed.
- **FIELD-2 → still OPEN, now unblocked:** qa-lab filed the failing-bank OCR text + suggested patterns (KTB bare `ไปยัง`; TTB 2nd-block positional on the `XXX-X-XX###-#` mask; Paotang between `G-Wallet ID:` and `ค่าสินค้า/บริการ`). Dev owns parts 2–3; qa-lab re-runs `field-2-counterparty-capture.spec.ts` to flip it green.
- **My error, owned:** the capture-mode instruction in this brief (`next build && next start`) was wrong — `rawTextDebug` is gated `NODE_ENV === 'development'`, so the panel shows under `next dev`, not a production `next start`. qa-lab caught and corrected it; brief text below is fixed. (jodsa has two opposite NODE_ENV gates that are easy to swap: Serwist SW is *disabled* in dev — needs a prod build; `rawTextDebug` is *enabled only* in dev — needs the dev server.)

(The dev also fixed PWA installability outside this brief: `ddd0350` manifest URL `/manifest.json`→`/manifest.webmanifest`, `fe8fd82` real 192/512 icons replacing 1×1 placeholders — both were installability blockers. Out of this brief's scope; noted for the record.)

### qa-lab handoff (FIELD-1 + FIELD-2)
qa-lab owns the slip corpus + E2E harness, so route these to it. Both run against the local/branch build with the `5ebecfa` fix — **no Vercel deploy needed**.
- **(QA-FIELD-1)** mobile-viewport E2E (e.g. 390×844): import a **readable-QR** slip → reach the confirm form → assert the `w-full` submit button is inside the viewport and clickable (its bounding box does not intersect the `fixed bottom-0` nav), then save end-to-end. Stronger and repeatable vs a phone screenshot, and becomes a standing regression guard against nav occlusion. Also worth a non-QR control slip (shorter form) so the test pins the QR-only height delta. → clears FIELD-1.
- **(QA-FIELD-2)** run the corpus through the confirm flow on the **dev server (`next dev`)**; the `rawTextDebug` panel renders only under `NODE_ENV === 'development'` (a production `next start` hides it). Identify which bank(s) yield an **empty counterparty**, capture the **raw OCR text** for each failing slip, and file it (OCR text + bank name) — a `QA-FIELD-2` note here or straight to dev. Dev adds the `COUNTERPARTY_PATTERNS` entry + a unit test from the real string; qa-lab re-runs E2E to confirm the name pre-fills. FIELD-2 stays OPEN until that round is green.

---

## [M3] E2E RED — 2026-06-12
**From**: qa-lab
**Status**: RESOLVED (fix verified by qa-lab re-test 2026-06-12)

### Items

- [x] **(id: QA-M3-1)** major — Deleting a single generated recurring occurrence does not stick: it is **recreated on the next page load**. Repro: create a weekly recurring rule whose occurrences fall in the current month (`tests/e2e/m3-recurring.spec.ts`, M3-S2) → open `/transactions` (5 occurrences materialize) → delete one with its trash button (confirm the "ลบรายการนี้?" prompt) → reload `/transactions`. Expected: 4 occurrences remain (the deleted one stays gone — M3-AC1 "deleting an occurrence + re-reading does not recreate it"). Actual: the deleted occurrence reappears (back to 5). Confirmed on two consecutive runs. Evidence: `qa-lab/projects/jodsa/runs/M3-run-2026-06-12.md`; trace `tests/e2e/.results/m3-recurring-M3-S2-deletin-80960--is-not-recreated-on-reload-chromium/trace.zip`.

### Dev notes
Suspected cause (not asserted — for your triage): the transactions trash button calls `deleteTransaction(id)` (`app/actions/transactions.ts:50`), a plain row delete that writes no `recurring_exceptions` row. On the next load, `materializeOccurrences` (`lib/recurrence/materialize.ts`) finds no exception and no existing row for that date and re-inserts it. The action that does the right thing — `skipOccurrence(ruleId, occurrenceDate, txId)` (`app/actions/recurring.ts:88`), which deletes the row **and** records the exception — appears to be defined but never imported/called from any UI (grep found only its declaration). So a user has no way to permanently remove one occurrence of a rule. The recurrence engine and `skipOccurrence` themselves look correct in isolation; this is a UI-wiring gap. This is the path the M3 review verified by code inspection but noted had "No browser smoke test." Once wired, qa-lab will re-run M3-S2 (it becomes a regression scenario).

**Dev fix (2026-06-12):** `handleDelete` in `transactions-client.tsx` now branches — a materialized occurrence (`recurring_rule_id` + `occurrence_date` both set) goes through `skipOccurrence` (delete + exception) with the "ข้ามรายการประจำนี้?" prompt; manual transactions still use `deleteTransaction`. `skipOccurrence` also revalidates `/accounts`.
**qa-lab re-test (2026-06-12):** ✅ verified. M3-S2 green on isolated re-run and full M3 suite (3/3). Evidence: `qa-lab/projects/jodsa/runs/M3-retest-2026-06-12.md`. Standing regression guard in `tests/e2e/m3-recurring.spec.ts`.

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
