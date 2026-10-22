# REVIEW-INBOX

Briefs from reviewer agents: correction briefs from pm-desk, E2E bug briefs from qa-lab (ids `QA-*`),
spec changes from idea-forge (`SPEC-*`). Newest on top; **open items above closed history**.
Dev session: work through OPEN items, mark each `[x]` and note what was done, then ask the sender for a
re-check (qa-lab re-tests `QA-*` items; pm-desk re-reviews the rest).

<!-- all paths in this file are relative to workspace root E:\claudeWorkSpace -->

> **Pruned 2026-07-17 by pm-desk** (1316 → this). Resolved blocks were cut, not archived: every durable
> record survives in `pm-desk/projects/jodsa/reviews/` and `qa-lab/projects/jodsa/runs/` (both versioned
> in git). Each CLOSED line below cites its record. Open items were carried forward verbatim in substance.

---

# OPEN

## [RV-OWNERFB-2] Home budget strip counts income as spending — 2026-10-21 · from review session (Claude)
**Status:** RESOLVED 2026-10-22 — `spentForBudget` now rejects non-expense rows defensively; the unit regression mixes ฿500 expense with ฿1,200 income, and the B2 browser fixture proves the strip still shows ฿9,500 remaining. Focused unit tests pass 6/6, typecheck passes, and the Home E2E spec passes 6/6. A full 110-test E2E attempt was not green: 35 tests passed before unrelated cross-feature 120-second timeouts began, so the repeated timeout run was stopped. Post-mortem: `docs/postmortems/RV-OWNERFB-2-home-budget-income.md`.

Reported by design-studio's screenshots,
confirmed by source and by the reviewer's own 2026-10-21 screenshot (฿500 expense + ฿1,200 income against a
฿10,000 budget showed "เหลือ ฿8,300", i.e. ฿1,700 spent).

`app/(app)/dashboard/page.tsx` queries `monthTx` with `.in('type', ['income', 'expense'])` (it also feeds
`buildLastAccountMap`) and passes it straight to `budgetStatus(budget, monthTx as ExpenseRow[], now)`.
`lib/budget.ts` documents that budgets track expense only and that **the caller** must pass `type='expense'` rows;
it does not filter. So every income row inflates "spent", "เหลือ", the bar and "ใช้ได้อีกวันละ", and can flip the
strip to "เกินงบ". The pre-B2 one-liner had the same call, so this likely predates `cb67fae`. Fix: filter to
`type === 'expense'` before `budgetStatus` (or make `spentForBudget` ignore non-expense rows defensively, with the
row type in `ExpenseRow`). Check `/budgets` and any other `budgetStatus` caller for the same pattern. Tests: a unit
test with mixed income/expense rows, and extend the B2 E2E fixture with an income row so ฿9,500 still holds.

## [RV-OWNERFB-1] Home B1 counts fully-sold holdings in the investment total — 2026-10-21 · from review session (Claude)
**Status:** RESOLVED — 2026-10-21. Home now reads the investment ledger, applies the same ledger-quantity-zero rule as QA-INVEST-1, and omits closed holdings from both the investment total and breakdown. The focused stale-value unit test reproduced the pre-fix failure (`120000n` received instead of `0n`); the fixed suite passes 332 tests with 34 live-RLS tests skipped. The deterministic browser fixture proves Home and `/invest` both show ฿1,000 while a fully sold holding retains a stale ฿5,000 stored value, and the Home breakdown contains only the active holding (`5 passed`). Typecheck and lint pass. Production owner data and deployment were not changed or verified.
**Reviewer re-check 2026-10-21 (Claude): CONFIRMED** at `d81940d`. Source fix in `8ea8585` reviewed; `tsc` 0, lint 0,
vitest 332 passed / 34 skipped re-run independently. Mobile (iPhone 13) screenshots on the E2E test user: Home shows
≈฿1,700 = ฿700 cash + ≈฿1,000 investments with the stale ฿5,000 sold holding omitted; breakdown sheet lists 6 accounts.
A2 `4fd4291` matches brief A2 (3-col tiles with balances, ✓ selected state, dimmed-in-place transfer source, swap);
B3 daily "จ่าย" total and B4 type icons/signs visible on `/transactions`. A one-off Next dev-overlay "1 Issue" on the
first cold run did not reproduce on two re-runs with console capture (no errors/warnings).

**Post-mortem:** `docs/postmortems/RV-OWNERFB-1-home-closed-holding.md`.

`app/(app)/dashboard/page.tsx` sums `valueCurrentHolding()` (`lib/invest/portfolio.ts`) over **every** row of
`holdings`, reading the stored `current_value_minor` "without loading the trade ledger". QA-INVEST-1 (`e6ff4cb`)
established that the stored current value is **stale once ledger quantity reaches 0** and made ledger quantity
authoritative everywhere in `/invest`. Home now bypasses that rule, so a fully sold holding (the owner sold SGOV on
2026-10-07) is still added to เงินทั้งหมด and listed in `components/balance-breakdown-sheet.tsx` — Home and `/invest`
will disagree. Fix: derive closed status from the ledger (reuse the cost-basis / `aggregateByAsset` path, or a
lightweight per-holding qty sum) and exclude qty === 0 holdings from both the total and the breakdown list. Add a
unit test with a fully sold holding that has a non-null stale `current_value_minor`, and an E2E assertion that Home's
investment sub-line equals the `/invest` total.

Verified as claimed at `677092d`: `tsc` 0, lint 0, vitest 331 passed / 34 skipped. New light-theme type tokens
measure 5.24–5.92:1 on card and page background (dark 6.21–8.31:1), meeting the B4 brief. The `/invest` date fix
(`b3d044f`) is correct for new writes; existing shifted rows remain unrepaired, as the post-mortem states.

## [SPEC-6] Ballast sleeve: classification and reporting — 2026-10-10
**From:** idea-forge
**Status:** RESOLVED — 2026-10-20: implementation `8b16f02`, applied owner-authorized SQL 0010, independent QA GREEN `757ef83` and PM APPROVED `33bff60`. Acceptance covers code and targeted behavior; deployment and owner reclassification are not certified.
**Related:** QA-INVEST-2.

### Approved change
- [x] Extend `holdings.sleeve` to `core|ballast|satellite|risk_capital`; preserve default core, legacy labels and risk-capital warnings.
- [x] Add Ballast / ตัวถ่วง (Ballast), portfolio-role wording and contextual helper to create/edit forms, badges, allocation and snapshots.
- [x] Hand-author the next CHECK-constraint migration and align schema metadata, Supabase types and Zod validation. Preserve rows, policies, grants, defaults and NOT NULL; no automatic backfill.
- [x] Reclassify only through explicit authenticated user edits; preserve broker, ledger, quantities, valuation, FX, cost and P&L. Historical snapshots and plans remain unchanged.
- [x] Verify four-value validation/persistence, 60/20/10/10 allocation, same-asset/different-sleeve grouping, old/new snapshots, Thai/English create-edit-reload and live two-user isolation. Coordinate with QA-INVEST-1 valuation fixes.

**Closure evidence:** `qa-lab/projects/jodsa/runs/QA-SPEC6-ballast-live-2026-10-19.md` and sanitized summary: 32 behavior cases + setup passed, zero skips/failures/flakes; 327 unit tests passed / 34 API-level live-RLS tests skipped, typecheck/lint exit 0. `pm-desk/projects/jodsa/reviews/SPEC-6-ballast-review-2026-10-20.md` independently approves code/spec and targeted behavior. Paths are workspace-root-relative. Post-mortem: `project/jodsa/docs/postmortems/QA-INVEST-2-ballast-classification.md`. Separate DB NULL/unknown/default DML probes, production build/deployment and owner edits were not run; historical-plan preservation is source-contract evidence, not a browser before/after comparison.

### Planner boundary and rollout
The actual field is `sleeve`, not `risk_group`. M5 drift is asset-class-based. Changing core to ballast alone must preserve drift, concentration, stress, risk-capital percentage, suggestions and verdict; missing proxy classification still blocks planning. Sleeve targets, new recommendations and OCR remain out of scope.

**Authority:** `idea-forge` commit `6e49465`; `idea-forge/ideas/jodsa-investments/README.md` Changelog 2026-10-10, `idea-forge/ideas/jodsa-investments/docs/02-architecture.md`, and `idea-forge/ideas/jodsa-investments/docs/04-roadmap.md`.
**Implementation seams:** `project/jodsa/docs/plans/QA-INVEST-2-ballast-proposal.md`.
Product/model approval is recorded. Exact SQL 0010 was separately authorized and applied on 2026-10-18 before live ballast QA writes; see `docs/plans/QA-INVEST-2-live-migration-2026-10-18.md`. Independent qa-lab/pm-desk verification is required; skipped live checks must be reported.

## [DS-1] Motion: focus ring fades in · progress bars animate `width` — 2026-10-04 · from design-studio
**From:** design-studio · **Status**: RESOLVED — 2026-10-12 sync: implemented in `project/jodsa` commit `e6ff4cb`; independent qa-lab GREEN at `ff94715`.
**Closure evidence:** `qa-lab/projects/jodsa/runs/QA-review-2026-10-10.md`; focused keyboard-focus and budget reduced-motion browser checks passed. All six progress fills and the nav shadow token were source-reviewed; transient OCR fills were not separately rendered.
**Evidence:** code (git grep at `7d80848`) + rendered desktop at 1440×900 on `pnpm dev` (QA user A). Found
while trialling the external Hallmark audit rubric (gates 14 / 15 / 48); the rules now live in
`design-studio/.claude/skills/design-review/SKILL.md` lens 4.

1. **Focus ring transitions in (a11y).** `project/jodsa/components/ui/button.tsx:8` uses `transition-all`, so
   the `focus-visible` ring/outline animates in instead of appearing instantly — keyboard users briefly have no
   indicator, on every button in the app. → Replace with the properties that should animate, e.g.
   `transition-[color,background-color,border-color,opacity,transform]`; leave outline/box-shadow untransitioned.
2. **Progress bars animate `width` (layout property).** `transition-all` + inline `width:%` on:
   `project/jodsa/components/budget-bar.tsx:40`, `project/jodsa/components/add-slip-sheet.tsx:148`,
   `project/jodsa/app/(app)/import/import-client.tsx:214` and `:330`, `project/jodsa/app/pay/[token]/pay-client.tsx:206`,
   `project/jodsa/app/pay/[token]/trip-client.tsx:371`. → Full-width fill with `origin-left` +
   `transform: scaleX(p)` and `transition-transform`; keep the existing reduced-motion fallback behaviour.
3. *(minor)* **Inline shadow colour.** `project/jodsa/components/app-nav.tsx:73` hard-codes
   `rgb(16 60 48 / 0.28)` in the mobile bar's shadow → lift to a `--shadow-*` token in `app/globals.css`
   beside `--shadow-float`.

Not filed here (owner / design-studio call first): the desktop layout — no `lg:`/`xl:` breakpoint anywhere,
content capped at `max-w-4xl` (896 px) centred in a 1216 px main, ~340 px idle gutters, phone-width controls
stretched (quick-add type buttons 260 px each). That is the known v5 desktop gap, not a DS-1 fix.

## [OWNER-FB-20261003] Owner usability feedback batch — 2026-10-03 · from owner (via fin-desk session)
> **▶ RESUMED 2026-10-22 — restyle in Honey first.** The owner chose design-studio's Direction D "Honey".
> Brief: `idea-forge/ideas/jodsa/docs/07-design.md` section "Visual language v6 — Honey (OWNER-CONFIRMED
> 2026-10-22)" (idea-forge `bc7197a`); Figma file `85YURQNppODPO2dFxD8O6W`, page "D — Honey · All screens"
> (node ids per screen in the brief). Order: **fix [RV-OWNERFB-2] first**, then the brief's "Restyle build
> order" **R0 tokens → R1 primitives → R2 shared money components → R3 screens → R4 verify**, then continue
> **migration 0011 → A3 → migration 0012 → C2 → C1 built directly in Honey**. Visual-only steps: no schema or
> behaviour change; one step per commit; re-run E2E each step. 0011/0012 still need explicit owner
> authorization before being applied to the live DB.
**Status**: OPEN — **Phase A + B CLEARED FOR BUILD 2026-10-21.** The owner confirmed the design-studio
addendum in two rounds; the brief is `idea-forge/ideas/jodsa/docs/07-design.md` section "Revision 2026-10-20 —
OWNER-FB batch (OWNER-CONFIRMED 2026-10-21)" (idea-forge `1b4dccd`). Build in **its "(a) Build order"**:
B4 colour tokens → B3 daily total → B2 budget strip → B1 home headline → A2 account grid → A1 add sheet with
multi-slip queue + bulk save → migration 0011 (`note`, `reconciled_at`) → A3 payee + display name → migration 0012
(`invest`, `divest`, `holding_id`) → C2 ลงทุน / ถอนจากพอร์ต → C1 reconcile-by-backfill **only after Phase B #2 is fixed**.
Key owner calls (do not re-decide): payee is kept everywhere, display name is optional; the reconcile remainder
**counts** as expense/income under system category `ปรับยอดให้ตรงธนาคาร` (no adjust types); Home headline is
เงินทั้งหมด with cash and investments as visible sub-lines; slips of any count stay in the same sheet.
Migrations 0011/0012 are hand-authored and need explicit owner authorization before being applied to the live DB.
One item per commit; ask qa-lab / design-studio to re-check each slice. Phase C (#11) stays plan-only.

**Build progress 2026-10-21 — READY FOR INDEPENDENT RE-CHECK (not self-certified):**
- [x] B4 colour tokens + type icons/signs — `0f4c2e6`.
- [x] B3 daily expense totals — `b79aff1`.
- [x] B2 Home monthly-budget strip — `cb67fae`.
- [x] B1 combined money headline + cash/investment sub-lines + breakdown/deep links — `4324626`.
- [x] Phase B `/invest` date defect — fix `b3d044f`, close record `8d65be3`.
- [x] Phase B `/budgets` all-zero observation — not reproducible on current production; non-zero E2E guard
  `1dd8c10`. The historical 2026-10-01 run has no reconstructed root cause.
- [x] RV-OWNERFB-1 Home closed-holding parity fix — resolved before A2 as owner ordered.
- [x] A2 `AccountGrid` — `4fd4291`; balance tiles, stable transfer grids, swap control and keyboard/a11y behavior.
- [x] A1 unified add sheet + multi-slip queue — `6e8d136`; Home and `/transactions` share the manual/slip sheet, `/import` and share target reuse the same sequential queue, and ready slips support per-row bulk save.
- [ ] Next build slice: migration 0011 (`transactions.note`, `accounts.reconciled_at`) then A3 payee + display name. Requires explicit owner authorization before changing/applying the data model.

Phasing (2026-10-20):
- **Phase A — design-studio drafts screens first, then build:** #1, #3, #4, #5, #6, #7, #8, #9, #10, #12 and the
  "ลงทุน" cash-to-holding gap below. Brief target: a dated OWNER-FB revision section in
  `idea-forge/ideas/jodsa/docs/07-design.md`, with the open owner decisions listed.
- **Phase B — defects, no screen design needed:** #2 (invest date shows next day — the `5a74ed7` review
  record) and the `/budgets` 6-month chart showing 0. Reproduce and fix with a failing test first; may run in
  parallel with Phase A design.
- **Phase C — architecture plan before any build:** #11 REST `app/api/v1` + personal access tokens. Needs a
  written plan (shared service layer vs. UI on REST, token storage/revocation, RLS) reviewed before code.

Verbatim (Thai), with a one-line reading of each:
1. ปุ่มบันทึกรายจ่ายด้วยสลิป — ถ้าหายาก ควรอยู่ตรงปุ่ม "+" แบบกรอกปกติด้วย → put slip-upload next to the normal "+ add" entry.
2. tune วันที่ให้ตรวจถูกขึ้น → improve date detection (slip OCR / import).
   Data point 2026-10-10: `/invest` transactions entered as `2026-10-07T20:30` (and SGOV `2026-09-08 20:30`) display as
   **8/10/2569** (and 9/9/2569) in the holding dialog — looks like a timezone/off-by-one-day display bug; verify.
   - [x] **Phase B `/invest` date defect fixed 2026-10-21** — production repro confirmed both shifted dates;
     `b3d044f` makes both investment write paths interpret `datetime-local` as explicit Bangkok time and adds a
     UTC-host regression test. Post-mortem: `docs/postmortems/OWNER-FB-invest-date-off-by-one.md`. Deployment and
     repair of already-shifted owner rows remain unverified and were not performed.
3. หน้าสรุปการเงินทั้งหมดมาจากไหน หุ้นด้วยไหม → the overall money summary must say what it sums, and whether `/invest` holdings are included.
4. เพิ่ม note ว่ารายการนี้ใช้ทำอะไร — ช่องผู้รับ/โอน: ไม่ใส่ = ใช้ชื่อเดิม, พิมพ์ = ใช้ตามที่พิมพ์ → editable label/note overriding the payee name.
5. แสดงใช้จ่ายรวมรายวันด้วย → daily spending total (e.g. per date header in `/transactions`).
6. flow เลือกบัญชีโอน เลียนแบบ MAKE by KBank (กล่องเลื่อน) — ถ้าติดข้อจำกัดเว็บก็ไม่เป็นไร → swipeable account picker for transfers; optional.
7. สีโอนยังดูไม่ชัดเจน → transfer rows need a more distinct colour.
8. หน้าหลักไม่ขึ้นเป้าหมาย ทำให้ไม่ตระหนักถึง → show savings goals on the home dashboard.
9. อัปสลิปจากหน้าแรกได้เลย ไม่ต้องย้ายหน้า → slip upload directly from home, no extra navigation.

10. **ปุ่ม "ปรับยอดให้ตรงธนาคาร" (owner-approved 2026-10-03)** → per account: owner types the real bank
    balance, the app computes the difference and writes one labelled adjustment transaction (expense or income)
    through the normal server action — validation + revalidation intact. Replaces the manual multi-form sync
    (and the temptation to write to Supabase with the service-role key, which `.env.local` reserves for migrations).

11. **ปรับ / migrate การเขียนข้อมูลให้มี REST endpoints (owner-requested 2026-10-03)** → today every write is
    a Next.js Server Action (build-scoped action id + session cookie), so no script/agent can sync data without
    driving the UI. Add `app/api/v1/...` route handlers (accounts, transactions, transfers, holdings) authenticated
    by a **revocable personal access token** (scoped to the owner's `user_id`, RLS still enforced — never the
    service-role key). Decide first: keep Server Actions for the UI and call shared service functions from both,
    vs. move the UI onto the REST layer. Largest item in this batch — design/plan before build.

12. **ตัวช่วยกรอกข้อมูลย้อนหลัง (owner-requested 2026-10-10)** → "อยากให้มีตัวช่วยกรอกข้อมูลย้อนหลังง่าย ๆ กรณีที่ลืม".
    Today backfilling a forgotten day = one full add-form per row, date picked by hand each time. Wanted (shape to be
    designed): pick a past date once → quick-add several rows for that day (amount · category · account) without
    re-opening the dialog; ideally "copy yesterday's recurring-looking rows" and a gap hint (days with no entries).
    Pairs with #10 (reconcile button): #12 fills in *what* was forgotten, #10 closes the remainder.

Gap found while syncing balances 2026-10-03: there is **no way to move cash into an investment** — a
transfer needs a destination *account*, and `/invest` buys don't debit any account. Buying VT+SGOV
(฿13,492.76 from Dime! Save) can only be recorded as an **expense** (inflates spending totals) or not at all
→ Dime! Save still shows ~฿12,552 that was spent on ETFs. Wanted: an "ลงทุน" transfer/link from an account to a holding.

Related observation (fin-desk monthly review 2026-10-01, not owner-reported): the `/budgets` → ภาพรวม
"รายรับ/รายจ่าย 6 เดือนล่าสุด" chart renders **0 for every month** although ~100 September expenses exist. Unverified
whether it is a query or a render defect — check while in this batch.

- [x] **Re-checked 2026-10-21 — not currently reproducible.** The signed-in production page renders non-zero
  bars (one income, two expense) from the owner's live book, so no speculative app fix was made. The existing
  M9 browser test only proved that Recharts mounted; it now also requires the seeded ฿500 current-month expense
  to produce a positive-height expense bar. Production deployment and the historical 2026-10-01 state remain
  distinct: this closes the current observation and regression gap, not a reconstructed root cause for that past run.

## [QA-INVEST-2] No ballast/defensive risk group — sleeve plan cannot be tracked — 2026-09-09 · from owner session
**Status**: RESOLVED — 2026-10-20, under approved SPEC-6; QA GREEN `757ef83`, PM APPROVED `33bff60`. No owner SGOV holding was backfilled or reclassified. Original report arose while recording real VT + SGOV purchases.

**2026-10-18 implementation update:** the original diagnosis below is retained as
historical context. The actual field is `sleeve`, and the existing planner computes
drift by asset class, not sleeve. SPEC-6 governs the approved reporting-only
fourth value. SQL 0010 is now applied with unchanged owner rows and security
metadata; browser acceptance subsequently passed and PM approved on 2026-10-20.
No SGOV backfill was performed.

**What's missing.** `risk_group` offers exactly three values (`db/schema.ts`, surfaced in the
add-holding dialog): `core` / `satellite` / `risk_capital`. The owner's standing allocation plan
(`fin-desk/advisory/profile.md`) runs on **three different sleeves**: แกนโต (growth core) ·
**ตัวถ่วง (ballast)** · ดาวเทียม (satellite). There is no bucket for ballast.

**Consequence.** SGOV — bought specifically as the ballast sleeve — had to be filed under `core`
alongside VT and VOO. The app now reports core ≈ 74% when the owner's plan means
**63.3% growth core + 11.8% ballast**. Those two numbers carry opposite meanings: growth core is
the thing being *diluted toward*, ballast is the thing being *held against* it. Merging them makes
the plan untrackable in the app that exists to track it.

**Why it matters beyond labelling.** M5's planner reasons over sleeve weights under the permanent
M0 guardrail (suggestions rest on concentration + drift). A ballast position counted as growth core
overstates equity exposure and understates the defensive sleeve, so drift is measured against the
wrong target — on a book where ballast is deliberately 11.8% and rising.

**Where to look.** `risk_group` enum in `db/schema.ts` + the holdings form and the aggregation that
feeds the concentration/plan views. Adding a fourth value is a migration plus a display pass; the
alternative (a free-text sleeve tag) is weaker because the planner needs a closed set.

**Not decided**: whether the fourth value is `ballast`/`defensive`, and whether existing `core` rows
need a backfill prompt. Product call — state it before building.

**Repro**: `/invest` → เพิ่มสินทรัพย์ → any asset → กลุ่มความเสี่ยง shows only the three options.

## [QA-INVEST-1] Fully-sold holding keeps its market value in `/invest` — 2026-09-05 · from owner session
**Status**: RESOLVED — 2026-10-12 sync: fixed in `project/jodsa` commit `e6ff4cb`; independent qa-lab GREEN at `ff94715`, focused spec `32ff8f3`.
**Closure evidence:** `qa-lab/projects/jodsa/runs/QA-review-2026-10-10.md`: five focused and twenty existing investment browser cases passed using synthetic QA accounts. Closed holdings remain as zero-valued history and are excluded from concentration/planning; active and reopened unclassified holdings still block planning. Production deployment and owner data were not verified or changed.
**Post-mortem:** `project/jodsa/docs/postmortems/QA-INVEST-1-closed-holding-stale-value.md`.

**What happened.** Recorded the owner's real ASML sale (0.0140444 units @ $1,870.35, fee $0.02,
2026-09-05) as a `ขาย` asset-transaction. The write succeeded and the units aggregation is correct —
the Assets tab now shows **ASML Holding N.V. · 0 หน่วย**.

**The defect.** With units at 0, the position still reports a non-zero market value and still occupies
a concentration slice:
- Assets tab row still reads **US$25.49** next to `0 หน่วย`.
- Overview `มูลค่ารวม` stayed **฿21,278.73** — unchanged across the sale.
- Concentration list still shows **ASML Holding N.V. 4.0%**.

Cost basis *did* update (`ต้นทุนรวม` ฿18,573.54 → ฿18,229.70, `กำไร` ฿2,705.19 → ฿3,049.03), so the sale
reached the ledger; only the market-value / concentration derivation ignores it.

**Why it matters beyond cosmetics.** Concentration is the **load-bearing input** for the M5 planner
under the permanent M0 guardrail (suggestions must rest on concentration + drift). A phantom 4.0% sleeve
skews every other weight — VOO 42.5% / NVDA 23.4% are computed against an inflated denominator, and NVDA
sits right under the owner's own ~25% trim trigger. A stale sold position can therefore move a real
buy/sell suggestion.

**Where to look.** The per-asset aggregation proven in INVEST-M3 (`reviews/INVEST-M3-review.md`) merges
transactions before computing concentration; the suspicion is that market value is derived from the
asset's last known price/snapshot rather than from `units × price`, so `units = 0` never zeroes it.

**Repro**: open `/invest` → any holding → เพิ่มรายการ → ประเภท `ขาย` for the full unit count → save →
reload → Assets tab and ภาพรวม.

**Not yet checked**: whether a fully-sold holding is meant to disappear from the list entirely, or stay
at 0/฿0 as history. That is a product decision — state it before fixing.

## [SPEC-4] `/invest` module — **1 milestone unbuilt** — 2026-07-14 · from idea-forge
**Status**: OPEN — GREENLIT Phase-2 build, **cannot close until M2 lands**. Builds INTO this app as the
`app/(app)/invest/` route group — not a fresh scaffold. Blueprint audited **SHIP, 0 blockers**.

**Authoritative spec (read in order):** `idea-forge/ideas/jodsa-investments/prompt.md` →
`docs/01-definition.md` (what/who/**non-goals**) → `docs/02-architecture.md` → `docs/04-roadmap.md`
(M0–M5 + acceptance) → `docs/05-risks.md` · `docs/06-audit.md`.
M5 analysis methodology: `Resources/portfolio-risk-review/portfolio-risk-methodology.md` (workspace root
— *not* `fin-desk/Resources/...`, which does not exist).

**Firm non-goals:** no order execution / broker integration **ever** · no paid market-data API in MVP
(manual prices) · not licensed advice · multi-tenant RLS isolation per new table.

### The only open milestone
- [ ] **M2 — Broker-Screenshot OCR** · complexity M · deps M1 (done) · **prereq: ~10 real Dime
  screenshots** — not yet collected; no corpus, no objective exit.
  Reuse the on-device worker; **image never uploaded**; ≥85% position-value correct; confirm grid with
  low-confidence flags.
  **Build note (from the Fable review):** `workers/slip.worker.ts` does QR/preprocess only (nested-WASM
  breaks Chrome/Safari); tesseract runs main-thread via dynamic import (`lib/slip/parse-image.ts`).
  `workers/portfolio.worker.ts` must copy that split — row-segmentation grammar is genuinely new work.
  **Verified unbuilt 2026-07-17:** no `workers/portfolio.worker.ts` on disk.

  **📸 Corpus spec — what the owner needs to shoot (asked 2026-07-17, answered here so it survives).**
  Target: `qa-lab/projects/jodsa/corpus/` (same home as the slip corpus; qa-lab is versioned now).
  The acceptance is **≥85% of positions' *current value*** correct — so the corpus must stress
  *row segmentation + number reading*, not variety for its own sake. ~10 shots covering:
  - **Varied position counts** (the roadmap's own word): one with **1–3** rows, one with **~5**, one with
    **10+ / needs scrolling** — row-splitting fails differently at each length.
  - **Each tab, because currency + name shape change:** `หุ้นสหรัฐฯ` (USD, short tickers) · `หุ้นไทย` (THB) ·
    `กองทุนรวม` (long Thai fund names that wrap — the hardest segmentation case) · `ทั้งหมด` (mixed currencies
    in one list — the case most likely to mis-assign a currency).
  - **Collapsed list vs one expanded row** — the expanded card exposes `จำนวนหุ้นคงเหลือ / ราคา / ต้นทุนต่อหุ้น /
    ต้นทุนรวม`; decide whether M2 reads only the list or also the detail, and shoot for that decision.
  - **Summary card visible** (`มูลค่าสินทรัพย์ทั้งหมด` + `1 USD = xx.xx THB`) in ≥1 shot — it carries the FX rate
    and a total the parser can self-check against.
  - **A losing position (red text)** if one exists — every current holding is green; red is a different
    render path and `-` signs are a classic OCR miss.
  - **Fractional qty with many decimals** (e.g. `0.0140444`) — already present, keep at least one.
  - **Light theme** if Dime has one; otherwise note that dark-only is the corpus's known limit.
  ⚠️ **Label every shot** (ground truth: symbol + current value per row). Unlabelled screenshots are not a
  corpus — "no corpus, no objective exit" is the M2 rule inherited from the slip milestone, and 85% is
  unmeasurable without the answers written down.

### Done (see CLOSED history for the verdict records)
M0 gate PASS · M1 · M3 · M5 — all code+unit APPROVED **and** qa-lab GREEN; migrations `0008` + `0009`
applied live; deployed.

### Residual non-blocking notes (pm-desk `INVEST-M5`, forward notes — **not correction items**)
- [ ] **NO-TRADE regression coverage is the degenerate (exactly-on-target) case only.** Suggest a third
  fixture with real within-band drift (~±2–3pt) asserting `no_trade`, to pin `UNDERWEIGHT_THRESHOLD`
  against a future edit. Verified passing today. Ref: `tests/unit/invest/planner/plan.test.ts:170`.
- [ ] **`lib/invest/planner/plan.ts:130` `ASSET_CLASSES[0]` fallback — unreachable today, latent tomorrow.**
  A look-through-only concentrated row would get a silently mislabeled `assetClass`. Proved unreachable
  now (max table weight 0.09 vs the 25% flag). Becomes live only if the look-through table gains a >25%
  constituent. Worth an explicit `continue` or a comment.
- [ ] **`proxy-params.json` `annualVol` is dead config** — zero consumers (`stress.ts` reads only
  `stressScenarios`). It is exactly the input a VaR/vol calc would need, sitting unused, and M0's
  guardrail forbids that surface. Remove it, or annotate "intentionally unconsumed — see M0 guardrail"
  so a future session doesn't read it as an invitation.
- ✅ *Forward note 1 (plans immutability untested) — RESOLVED by `c646e93`: `plans.Update` typed `never`
  + a live RLS assertion that the DB denies an owner's own update. RLS suite 34/34.*

---

## [SPEC-3] Phase 2 backlog — M10–M13 (Push · CSV · BYO Vision · Realtime) — 2026-07-14 · from idea-forge
**Status**: **PARKED** — blueprinted, **not the active target**. 2026-07-14 the owner chose the investment
module (SPEC-4) as the Phase-2 build instead. Keep M10–M13 as planned backlog; **do NOT start M10** until
the owner re-prioritizes. Net-new phase, not a fix to M1–M9.

**Ordering & why (when resumed): M10 → M11 → M12 → M13** — engagement + quick-win first; the two items
that **reverse an MVP non-goal** go last, each behind an explicit opt-in.

**Authoritative spec:** `idea-forge/ideas/jodsa/docs/04-roadmap.md` §"Phase 2" (deliverables +
acceptance) · `docs/02-architecture.md` §"Phase 2 subsystems" (the 🔴 cron service-role carve-out + the
two non-goal reversals) · `docs/05-risks.md` §"Phase 2 additions". The frozen snapshot at
`project/jodsa/docs/source-idea/` predates this phase — the live `idea-forge/ideas/jodsa/docs/` wins.

- [ ] **M10 — Push Notifications (Web Push + Vercel Cron)** · L · deps M9 + M7-D. VAPID +
  `push_subscriptions` (owner RLS) + Serwist `push`/`notificationclick`. Delivery via
  `app/api/cron/notify/route.ts` (`CRON_SECRET`-gated) using `web-push`; daily reminder 12:00/22:00 ICT
  (= 05:00/15:00 UTC) + recurring-due "จ่ายยัง?" confirm (Confirm keeps the row; Skip writes
  `recurring_exceptions` **and reverses** the materialized occurrence — idempotent, reconciles with the
  M7-D lazy materializer, never double-deducts) + optional budget-over-limit (stretch).
  🔴 **The cron route is the ONE sanctioned server-side service-role path** (system trigger, no user
  input) — import the service-role client **only** under `app/api/cron/`; M10 acceptance includes a grep
  guard that nothing else does. iOS Web Push needs an installed PWA (16.4+) — say so in settings.
- [ ] **M11 — CSV Export** · S · deps M9. Client-side only (no infra/schema): Settings → Export,
  date+type filter → in-browser CSV Blob download; satang→baht at format time; **UTF-8 BOM** for Excel
  Thai; RLS-scoped to the signed-in user.
- [ ] **M12 — BYO Vision Key** ⚠️ *reverses "no server AI vision"* · M · deps M2. Opt-in, default OFF; key
  stored **only in the browser**, **browser calls Google Vision directly** — key never hits a JodSa
  origin. Only the OCR text source changes; `lib/slip/extract.ts` unchanged; any failure falls back to
  Tesseract. Mandatory one-time privacy acknowledge (image leaves device).
- [ ] **M13 — Realtime Live-Sync** ⚠️ *reverses "sync-on-load only"* · L · deps M9. Supabase Realtime
  `postgres_changes` on the **authenticated** client (RLS filters the stream); lazy (not in first paint),
  subscribe-on-focus + reconnect-on-resume, patch TanStack Query cache. **Security-critical:** ship a
  2-user realtime-over-websocket isolation test (mirrors M4 anon-deny).

**Before writing M10 feature code:** confirm resolved versions of any new deps (`web-push`; Google Vision
is a REST call, no SDK) against the React 19 / Next 15 lockfile, and add `.env.example` entries
(`*_VAPID_*`, `CRON_SECRET`) — same discipline as `START-HERE.md`.

---

## [FIELD-4] UX/UI field feedback round 4 — **PARKED, do not build yet** — 2026-09-02 · from owner

**Status**: PARKED / collecting. The owner cleared all expense transactions on 2026-09-02 to start a fresh
book and will **use the app for ~1 month, then send one consolidated feedback batch** (~early Oct 2026).
Do **not** implement these piecemeal — they are logged now only so they survive the wait. Re-open as a
normal build item when the owner sends the full batch.

Two items captured so far:

- [ ] **Date input format** — the date field should start / display as **`dd/mm/yy`**. Current behaviour
  not yet audited against this; check the add-transaction date control and any other date entry point
  (recurring rule dates, filters) for the same convention.

- [ ] **Recurring rules — start/end date must be optional.** Today `recurring_rules.start_date` is
  `NOT NULL` (`db/schema.ts`, `0001_initial.sql`); `end_date` is already nullable. Desired semantics:
  **no dates given = runs indefinitely**. The owner explicitly said a **stop button** on the rule is an
  acceptable alternative to date-bounding — *"ไม่ต้องหักชั่วคราวก็ได้"* (a temporary-pause/skip mechanism is
  **not** required). So the minimum viable shape is: optional start/end + an explicit stop/deactivate
  action, no pause semantics.
  ⚠️ Touches schema + the materialization guard (`recurring_rules.materialized_through`,
  `0006_perf_balance_rpc_materialize_guard.sql`) — an unbounded rule changes what "already materialized"
  means. Design before coding; see the M7-D post-mortem (`docs/postmortems/M7-D-recurring-never-deducts.md`)
  for how this area has burned us before.

**Data context for whoever picks this up:** as of 2026-09-02 the owner's book is empty by design —
`transactions` 0 rows, `groups` 0 rows, all 6 accounts kept with their original opening balances, and the
`/invest` side (6 holdings, 6 asset_transactions, 2 plans) untouched. A JSON backup of the 26 deleted
transactions was handed to the owner; it is **not** in the repo.

---

## Open harness / user items

- [ ] **(id: QA-M7-H1)** [qa-lab harness — **not an app/dev defect**, non-blocking] — the M7/M3 E2E specs
  share one test user + a mixed reset strategy, so a consolidated one-shot run is order-flaky:
  `tests/e2e/m3-recurring.spec.ts` fails right after the OCR-heavy `m7-dup-override`, passes in
  isolation. qa-lab owns hardening its own suite. Open since 2026-07-11; out of scope of the
  2026-07-14 regression sweep (which hardened its sibling QA-M9-H1).
- [ ] **(id: M9-USER-1)** [user config step, non-blocking] — set `NEXT_PUBLIC_SITE_URL` in the Vercel env
  **and** add it to Supabase → Auth → Redirect URLs, so the `89f59e8` signup email-redirect resolves on
  prod. *pm-desk cannot verify Vercel/Supabase dashboard state from the repo — left open as unverified.*

---

## Known limitations (slip parser) — accepted, deferred realities · **not live bugs**

These are ruled scope decisions, not open work. Each is guarded by a standing regression assertion so it
can't silently get worse. Durable records: `pm-desk/projects/jodsa/reviews/M2-review.md` ·
`qa-lab/projects/jodsa/runs/{FIELD-2-close,M2-S5-retest}-2026-06-13.md`.

- **TTB จ่ายบิล amount → manual entry** (was `QA-M2-1`). Root cause: tesseract **drops the large bold
  number entirely** as an artifact — there is no text output for that region, so the OCR-split join fix
  (`extractAmount`'s `\d+\s+\.\d{2}` collapse) cannot help. 10/12 corpus slips still correct → M2's
  ≥9/10 acceptance holds. *Future path (post-M2, out of scope):* force a single-column bounding box on
  large centered text, or a fallback OCR engine for that layout region.
- **Biller NAME on bill payments → not extracted, field falls through to empty** (was `FIELD-2` /
  `QA-FIELD-2a` item 1, and the older `M2-9b`). **Scoped out by pm-desk verdict 2026-06-13** for
  **both TTB and KTB**: billers are id-based (`(NNNN…)`) with no name mask or label anchor; chasing them
  invites wrong captures, and **wrong-but-plausible is worse than empty**. `TTB_POSITIONAL` deliberately
  requires **≥2 mask matches** before firing — transfers carry two blocks (sender+recipient → last =
  recipient ✓), bills carry one (sender only) → fallback skipped → empty.
  ⚠️ **Do not "fix" this by loosening the ≥2 gate** — that regresses to showing the payer their own name.
- **Paotang merchant is best-effort** (confidence 0.5, the lowest tier). OCR quality on Paotang is poor
  — captures degrade (`ร้านสุกี้ รสเด็ด` → `รานสุก รสเดด`). The `G-Wallet ID:` anchor tolerates OCR
  variants (`[I!1l][D0]`, optional hyphen). Not a blocker by ruling.
- **`detectSourceApp` make/kplus/ktbnext patterns are best-effort** — only Paotang and ttb have
  corpus-verified brand text. Doesn't affect acceptance: `number_hint` ranks **above** app-signature in
  `resolveAccountDefault`, so MAKE-vs-KBank disambiguation works regardless.

**Standing regression guard:** `tests/e2e/field-2-counterparty-capture.spec.ts` — transfers/merchants
**must** pre-fill the recipient (KTB 3/3, TTB 2/2, KBank 2/2, Paotang 3/3); TTB & KTB **bills must stay
empty** (guards the sender from ever returning); Paotang `G-Wallet !0:` → `ปราณี`.

---

## Repo gotchas — **permanent; read before touching schema, routes, or the OCR panel**

- 🔴 **`drizzle-kit generate` is broken in this repo.** Every migration from `0007` on is **hand-authored
  SQL with RLS inline** (`0007`, `0008`, `0009` all were). `db/migrations/meta/_journal.json` is **stale**
  (lists only through idx 4) and there is a duplicate-numbered `0005` pair. Write the next migration by
  hand; update `db/schema.ts` + `lib/supabase/types.ts` to match by hand too.
- 🔴 **Never auto-apply a migration to live Supabase — surface it for owner sign-off.** When authorized,
  `0008`/`0009` were applied atomically via **postgres.js simple-protocol**, not drizzle-kit. Expect the
  new table's RLS suite in `tests/unit/rls.test.ts` to error at `beforeAll` with
  `Could not find the table 'public.<x>'` until the migration lands — that is the **expected** pre-apply
  state, not a regression.
- 🔴 **Runtime user data flows only through `supabase-js` + the user session** so RLS applies. Never
  Drizzle / direct connection / service-role on a request path. New tables ship RLS enabled + full owner
  policies + a **live 2-user isolation test** before merge.
- **New routes go in `app/(app)/<route>/`** — inside the auth-guard group (`app/(app)/layout.tsx`). A
  top-level `app/<route>/` renders with **no auth and no nav**. Nav v3 is a fixed 4-dest + FAB bar, so a
  new destination enters via `/more` + the desktop sidebar.
- **Design authority = `idea-forge/ideas/jodsa/docs/07-design.md` (v3)** — **not** the v1 snapshot at
  `project/jodsa/docs/source-idea/docs/07-design.md`. v3 tokens are live in `app/globals.css` since M9.
- **Money layers are separate and both are integer minor units, never floats.** `lib/money.ts` = THB
  satang, `integer` (int4) columns, expense core. `lib/invest/money.ts` = multi-currency + FX-at-cost,
  **`bigint`** columns (do not copy the int4 pattern — it caps at ~฿21.4M in satang). `tsconfig.json`
  targets **ES2020** specifically so bigint literals (`0n`) type-check. `decimal.js` is deliberately
  **not** a dependency — every ratio in the planner is already an approximate/proxy input.
- **Two opposite `NODE_ENV` gates that are easy to swap:** the Serwist SW is **disabled in dev** (needs a
  prod build to test); `rawTextDebug`, the OCR debug panel, is **enabled only in dev** (`next start`
  hides it — capture OCR text via `next dev`).
- **Recharts must stay out of `/dashboard` and `/invest` first-load chunks.** Verify by grepping every
  chunk `.next/app-build-manifest.json` lists for that page — don't take the bundle summary on faith.
- **Supabase free tier pauses after ~7 days idle** — an E2E/RLS suite failing to connect may just mean the
  project is paused.
- 🔴 **Turbopack can serve a stale build across a full dev-server restart.** Hit on 2026-07-20 (SPEC-5
  F2): a changed Tailwind class was on disk and `tailwind-merge` was proven correct in isolation, yet the
  DOM kept the previous class through three reload + two full restart cycles. **`rm -rf .next` was the
  only fix.** Before debugging "my class isn't applying", confirm the class is actually in the DOM's
  `className` — if it is missing entirely (rather than present-but-losing), suspect the build cache, not
  CSS precedence.
- **A shadcn base utility with a variant can silently beat your local override.** `components/ui/input.tsx`
  ships `md:text-sm` **and** `dark:bg-input/30`; both outrank an unprefixed override at their breakpoint /
  theme, which is how the amount field ended up 14px on desktop and invisible in light (SPEC-5 F2). When
  overriding size or background on `Input`, override the **variant** too (`md:text-…`, `dark:bg-…`).

---

# CLOSED — history (one line each; the cited record is the durable evidence)

**Expense core — M1–M9 COMPLETE 🎉 (2026-07-13).**
- **SPEC-5** (design-studio, design v4 visual-layer amendment — F1–F6 + SPEC5-1..4) CLOSED 2026-07-22 —
  **APPROVED**; both closure conditions met: SPEC5-1 datetime-restore landed (source + `toDatetimeLocal`
  class fix) and **QA-SPEC5 E2E GREEN** (F6 optimistic save + SPEC5-1 rollback, 11/11 — also caught &
  fixed a React-19 transition commit-timing defect that made F6 inert). Gates re-run at close: tsc 0 ·
  vitest 295/34-skip · Playwright 11/11. `pm-desk/projects/jodsa/reviews/SPEC-5-review.md` (CHANGES
  NEEDED) + `reviews/SPEC-5-close-review.md` (close) · `qa-lab/.../runs/QA-SPEC5-2026-07-21.md` (RED) +
  `runs/QA-SPEC5-reverify-2026-07-22.md` (GREEN) · post-mortem
  `project/jodsa/docs/postmortems/SPEC5-1-optimistic-save-inert.md`. Non-blocking follow-ups: light
  `--popover`==`--card` → design-studio; `revalidatePath`×4 not narrowed → Phase-2 tech-debt; owner
  live-account test expenses → owner deletes manually.
- **M9** CLOSED 2026-07-13 — UX Reset design v3; code+unit APPROVED + QA-M9 prod-build E2E GREEN, both
  independently re-verified. `pm-desk/projects/jodsa/reviews/M9-review.md` ·
  `qa-lab/projects/jodsa/runs/QA-M9-2026-07-13.md`.
- **M8** CLOSED 2026-07-12 — Smart Account Mapping; `0007` applied live; QA-M8 GREEN (live-RLS 18/18 +
  prod-build E2E). `reviews/M8-review.md` · `runs/QA-M8-2026-07-12.md`. (`M8-USER-1` resolved.)
- **M7** CLOSED 2026-07-11 — Ledger Correctness & Editing; QA-M7 prod-build E2E GREEN.
  `reviews/M7-review.md` · `runs/QA-M7-2026-07-11.md` · post-mortem
  `project/jodsa/docs/postmortems/M7-D-recurring-never-deducts.md`. (`M7-USER-1` closed 2026-07-17 by
  `67175fc` — the recurring fix is in the deployed line, prod-verified by QA-M7.)
- **SPEC-1** (idea-forge, 2026-07-07 field-feedback round 2 → M7/M8/M9) RESOLVED — all three shipped and
  closed. **SPEC-2** (M7-D recurring-never-deducts) RESOLVED — see the post-mortem above.
- **M6-TRIP** CLOSED — `reviews/M6-TRIP-review.md` · `runs/M6-TRIP-run-2026-06-19.md`.
- **M5 / M4 / M3 / M2 / M1** CLOSED — `reviews/{M3,M2,M1}-review.md` · `runs/{M5,M4,M3-retest,
  M2-S5-retest,M1-M2}-*.md`. Includes: `QA-M3-1` (deleted recurring occurrence recreated → `skipOccurrence`
  wired into `transactions-client.tsx`), `QA-M2-2` (K+ bare-name-before-PromptPay-mask positional
  pattern), `M2-5..M2-12` (EMVCo tag-62/05 ref_code, header-scan bank detection, `findTimeAfter`,
  decomposed sara-am `ํา`→`ำ` normalization), `M1-1..M1-4`. `M2-1` (≥9/10 accuracy) met at 10/12 corpus;
  `M2-2` (no image upload) and `M2-4` (soft-dedup) verified; `M2-3` (duplicate-QR rejection) was superseded
  by the `M2-7` dedup fix (per `pm-desk/projects/jodsa/progress.md`) and is now covered by the standing
  `tests/e2e/{m2-slip-import,m7-dup-override,trip-4-authz-dedup}.spec.ts` specs.
- **FIELD-1 / FIELD-2 / FIELD-3** CLOSED 2026-06-13 (post-MVP device-testing round) — mobile Save button
  behind the bottom nav (`pb-24 md:pb-6`, guarded by `tests/e2e/field-1-mobile-save.spec.ts`); counterparty
  pre-fill for KTB/TTB/Paotang layouts + the sender-as-counterparty correctness fix; bank-matched account
  auto-select. `runs/FIELD-{1-run,2-capture,2-retest,2-close}-2026-06-13.md`. Residual scope decisions →
  **Known limitations (slip parser)** above.

**`/invest` module (SPEC-4) — M0 · M1 · M3 · M5 done; M2 still open (see OPEN).**
- **QA-M5** GREEN 2026-07-17 — Plan tab, prod build + live Supabase, **9/9**, no app defects, no bug briefs
  filed. Order-independence real: `invest-m5` 10/10 twice; full `invest-*` suite 21/21 three times.
  `runs/QA-M5-invest-2026-07-17.md` (+ `runs/evidence/qa-m5-no-trade-2026-07-17.png`). NO-TRADE ruled a
  first-class outcome. Not covered, stated plainly: the **owner's real seeded portfolio** was not the
  fixture (an M0-*shaped* book was reconstructed as test user A), and fixtures use synthetic **FX 1.0**.
- **INVEST-M5** APPROVED (code+unit) 2026-07-16 — AI Monthly Buy/Sell Planner at `9b1a1c8`. M0 guardrail
  met **by omission** (repo-wide grep for VaR/CVaR/risk-contribution → zero); no-execution guard real and
  independently swept; NO-TRADE genuinely reachable; effective NVDA 27.36% inside M0's hand-derived 26–29%
  band. `reviews/INVEST-M5-review.md`. Residual forward notes → SPEC-4 above.
- **INVEST-M3** APPROVED 2026-07-15 — Portfolio Dashboard at `ac1b16c`; per-asset aggregation before
  concentration proven by a fixture that fails without the merge. `reviews/INVEST-M3-review.md`.
- **INVEST-M1** APPROVED 2026-07-14 — Holdings + Asset-Transaction Ledger; `0008` applied live, 2-user RLS
  proven. `reviews/INVEST-M1-review.md`.
- **QA-M1 + QA-M3** GREEN 2026-07-15 — prod-build E2E, live Supabase; 12/12 twice, order-independent; the
  blank-FX excluded-holding banner confirmed. `runs/QA-M1-M3-invest-2026-07-15.md`.
- **M0 gate** PASS 2026-07-16 (fin-desk, N=1 real portfolio) —
  `idea-forge/ideas/jodsa-investments/docs/M0-validation.md`. **Its guardrail is permanent and binds M5+:**
  load-bearing suggestions must rest on **concentration + drift** (robust to proxy), never on precise
  risk-contribution / VaR / CVaR math (directional + tagged only).
- **Fable build-readiness review** GO-WITH-NOTES 2026-07-14 — M1/M3/M5 notes spent; the durable ones were
  folded into **Repo gotchas** above.
- Migration applies: `0008` (2026-07-14) and `0009` (2026-07-16) both applied live by the orchestrator on
  owner authorization and independently verified (19/19 system assets classified, 0 `proxy_class` nulls).
  The stale classify-flow premise (`36e38d0`) is corrected — the owner's 3 custom assets **are** classified,
  so his first plan does **not** hit `blocked`.

**Regression sweeps.**
- **Standing sweep** GREEN 2026-07-14 — trip + M4 guest-pay + the new **anon-deny** DB-layer security
  spec, prod build, 23/23 twice. `runs/regression-sweep-2026-07-14.md`. `QA-M9-H1` resolved there
  (`m9-trip` hardened, 16/16 twice). `QA-M7-H1` stays open → see OPEN.
