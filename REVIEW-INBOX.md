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

## [SPEC-5] E2E RED — F6 optimistic save is inert — 2026-07-21 · from qa-lab
**Status**: ✅ **RESOLVED — re-verified GREEN 2026-07-22 by qa-lab** (`qa-lab/projects/jodsa/runs/QA-SPEC5-reverify-2026-07-22.md`).
**SPEC-5's E2E requirement is met — clear for pm-desk to close.** (Original RED record below:
`qa-lab/projects/jodsa/runs/QA-SPEC5-2026-07-21.md`.)
Tested at `d94e3dc` on a **production build** (`pnpm build` → `pnpm start`), independently
reproduced on `pnpm dev` (clean `.next` both times — **not** the Turbopack-stale gotcha). Run:
**9 passed / 2 failed**; the 2 failures are one defect. New specs (qa-lab, write-boundary):
`project/jodsa/tests/e2e/spec5-optimistic.spec.ts` + `project/jodsa/tests/e2e/spec5-visual.spec.ts`.

**F1–F5 rendered claims that pm-desk could not verify (no browser run) are GREEN** — all measured on
painted pixels, both themes + the mobile viewport the v4 brief left unchecked: **F1** light
`card↔bg` ≥ 3.0 L\* (reproduces 3.89); **F2** amount wrapper border visible in BOTH themes + amount
≥ 30px on desktop; **F3** ladder 36→16→14 with distinct colours, focal untouched; **F4** `shrug`
mascot in the empty state, `filter` contains `invert` in dark; **SPEC5-4** zero 12px text on Home.
Edit still blocks (no optimism). No visual/typography/mascot defects found.

### Items
- [x] **(id: QA-SPEC5-1) — FIXED 2026-07-21.** Root-caused, fixed, and proven with qa-lab's own specs;
  full write-up in `project/jodsa/docs/postmortems/SPEC5-1-optimistic-save-inert.md`.
  - **Root cause (mechanism, corrected):** qa-lab's *behavioural* read was right (it acted blocking) but
    the *mechanism* it inferred ("the branch does not execute") was not — instrumentation proved the
    `optimistic && !editId` branch **ran to completion** (`entered / calledSubmit / calledOnSuccess` all
    true). The real cause: `useActionState` runs its reducer inside a React transition, and React 19
    withholds the **commit** of state updates made in it (the provisional row `addPending`, the sheet
    close `onSuccess→setOpen(false)`) until the transition settles — which a **Server Action invoked
    synchronously in the reducer's stack keeps pending**. `pendingTx.submit → runOptimisticCreate →
    await create()` called `createTransaction` in that scope, so React tied the row+close commit to the
    fire-and-forget write. Branch runs, effects don't commit until the POST lands ⇒ indistinguishable
    from blocking.
  - **Fix:** defer the optimistic side effects one macrotask out of the transition
    (`components/transaction-form.tsx`): `setTimeout(() => { pendingTx.submit(...); onSuccess?.() }, 0)`.
    Deferring only `create()` inside `runOptimisticCreate` was tried first and was insufficient —
    `onSuccess` lives in the reducer, so the whole side-effect block had to leave the transition.
  - **Proven, not asserted:** full SPEC-5 E2E **11/11** green. With the app fix `git stash`-ed out, the
    two regression specs go **RED** again; restored, GREEN — so they guard the regression rather than
    having been loosened to pass. The forced-failure injector was changed from instant-abort to
    **delay-then-abort** (`routeServerAction` applies `delayMs` before `abort`): a zero-delay abort let
    React batch close+reopen into one commit and hid the closed frame, false-failing a *correct* fix;
    the delayed variant is observable AND still fails on the old blocking code (verified by the stash
    run), preserving the anti-false-pass gate. tsc 0 · lint clean · vitest 295/34-skip.
  - **SPEC5-1 datetime restore is now integration-proven** — the `SPEC5-1` E2E forces a failure and
    asserts the sheet re-opens with amount + counterparty + **datetime (non-empty, exact, `checkValidity`
    true)** intact and the balance frozen. The unit-only gap pm-desk flagged is closed.
  - *(original qa-lab brief follows)*
  - ~~[ ] **(id: QA-SPEC5-1)** [blocker] **F6 optimistic J1 save does not run in the built app.** The
  quick-add sheet **blocks** on the disabled "กำลังบันทึก..." button until `createTransaction`
  resolves (~1.0–1.7s live), **renders no provisional row at any point**, and closes only *after*
  the write — i.e. the pre-F6 blocking behavior. v4 F6 (i) "provisional row paints, subdued, not
  tappable" and the whole "close immediately" premise are unmet.
  - **repro:** Home → type an amount in the quick-add card → บันทึก → in the sheet press บันทึกรายการ
    (also reproduces via the ＋ FAB and on a re-opened sheet). Spec: `tests/e2e/spec5-optimistic.spec.ts`
    `SPEC5-F6`.
  - **expected:** on submit the sheet closes instantly, a subdued non-tappable provisional row
    appears in "รายการวันนี้", balance unchanged until the server confirms, then it resolves to the real row.
  - **actual:** sheet stays open on a disabled "saving" button; a `MutationObserver` on `.opacity-60`
    records the provisional row **zero** times; `data-state` flips to `closed` only at ~+1.25s
    (write completion), never at +0.
  - **traced (not inferred):** the branch `optimistic && !editId` is at
    `components/transaction-form.tsx:155`; a live React-fiber probe of the mounted sheet form shows
    **`optimistic: true`, `editId: undefined`**, yet the reducer awaits the blocking
    `createTransaction` at `transaction-form.tsx:180`. `AppShell` passes `optimistic`
    (`app-shell.tsx:86`) and mounts `PendingTxProvider` (`app-shell.tsx:60`) — the wiring reads
    correct on disk, so the fault is at the branch/closure/`useActionState` runtime seam. **Root-cause
    + post-mortem is dev work;** qa-lab's finding is that the optimistic branch does not execute in
    the shipped build.
  - **consequence for SPEC5-1:** the datetime-restore fix (`a7056c6`) is proven only by
    `tests/unit/restore-values.test.ts`. Its **integration cannot be exercised** because
    `onFailure(restore)` lives on the optimistic branch alone; on the blocking path an aborted write
    leaves the sheet open (never re-mounted) with inputs retained, which *mimics* the intended
    rollback and would false-GREEN a naive test. The `SPEC5-1` spec's anti-false-pass gate (sheet
    must close on submit) fails, confirming the F6 rollback path never runs. **The demonstration
    pm-desk required for SPEC5-1 does not exist until F6 works.**
  - **fixed =** the optimistic branch actually runs for J1 manual create (sheet closes immediately,
    provisional row visible, balance frozen, rollback re-opens with every field incl. datetime), and
    `tests/e2e/spec5-optimistic.spec.ts` (`SPEC5-F6` + `SPEC5-1`) goes GREEN. Attach a post-mortem
    on why a structurally-correct `optimistic && !editId` branch was skipped at runtime.~~

### Dev notes
- **QA-SPEC5-1 fixed 2026-07-21** (see the `[x]` block above + post-mortem). **For qa-lab on re-review:**
  I edited your `spec5-optimistic.spec.ts` failure injector (instant-abort → delay-then-abort) because a
  zero-delay abort batched the close+reopen and false-failed the corrected app. I verified the changed
  gate still fails on the pre-fix code (stash run), so its anti-false-pass intent is intact — but it is
  your spec, so please sanity-check that change. No other test was altered. The two throwaway probe
  specs I used to root-cause were deleted.

### qa-lab re-verify — **GREEN** — 2026-07-22
**QA-SPEC5-1 RESOLVED at `a4f0cec`.** Record: `qa-lab/projects/jodsa/runs/QA-SPEC5-reverify-2026-07-22.md`.
Re-ran through the real UI on `pnpm dev` (clean `.next` each run). F6 optimistic now works: sheet
closes instantly, a subdued (`opacity 0.6`) non-tappable provisional row **paints during** the
in-flight write (prior run: zero times), balance frozen until confirm, then resolves to the real row.
SPEC5-1 forced-failure is **integration-proven** — sheet re-opens with amount + counterparty +
**datetime (`2026-07-15T13:45`, non-empty, `checkValidity` true)** intact, row rolled back, balance
frozen. Edit still blocks (scope guard holds). **Your edit to my failure injector is verified
legitimate:** I reverted only the app fix (`git checkout 3d8a63e -- components/transaction-form.tsx`),
kept the edited test, cleared `.next`, and both regression specs went RED again — `SPEC5-1` fails at
the line-157 anti-false-pass gate (sheet stays "visible" on the blocking path). The delay-then-abort
change made the closed frame observable for a correct fix **without** weakening the red-on-regression
property; restored after. **E2E 11/11 · tsc 0 · vitest 295 passed / 34 skipped** (all re-run this
session). `spec5-optimistic.spec.ts` + `spec5-visual.spec.ts` are the standing SPEC-5 regression.

## [SPEC-5] Design v4 — visual-layer amendment — 2026-07-17 · from design-studio
**Status**: OPEN — **not a milestone**, inbox work on the shipped expense core. Design v4 AMENDS v3's
visual layer; it does **not** reset anything. **Journeys J1–J7, nav, brand, type-colour semantics,
dark-theme tokens, density budget and every v3 anti-pattern stay binding and untouched.**

**Authoritative spec:** `idea-forge/ideas/jodsa/docs/07-design.md` — **§ v4 first, then § v3**
(v3 remains authoritative for everything v4 does not name). Design authority is still that file, **not**
the v1 snapshot at `project/jodsa/docs/source-idea/docs/07-design.md`.

**Why:** owner review 2026-07-17 — *"it still doesn't look good"*. **No new user field feedback**, which
is exactly why the scope is the visual layer only: v3's IA came from two rounds of user testing and
shipped in M9 (closed 2026-07-13). Findings below were **measured in-browser** on a live authenticated
`/dashboard` in both themes (computed values, not source-reading, not screenshot impressions).

### Work items
- [x] **F1 — light theme has no surface layering** — **DONE 2026-07-17** (`app/globals.css` `:root` only;
  dark verified byte-identical). **⚠️ The brief's own prescription was wrong and the fix is wider than it
  said — read this before reviewing:**
  - **Brief said:** move `--background` alone, start `oklch(0.975)`. **That cannot work.** Measured
    `0.975` → `lab 97.15` → card gap **2.85, still under the 3.0 acceptance**. The ladder needs ~7 lab of
    room below the white `card`, but only **4.53** existed before `--muted` (95.47) — so `background`
    cannot clear *both* `card` (≥3.0) and `muted` (≥2.5) at once. `--muted` had to move too.
  - **`bg-muted` on the page background is a real usage, not hypothetical** — 41 call sites incl. the
    `loading.tsx` skeletons, which sit directly on the background. Letting `bg↔muted` collapse to 1.69
    would have made every skeleton nearly invisible.
  - **Moving `--muted` forced `--muted-foreground`**, which surfaced a **pre-existing v3 violation**:
    `muted-foreground` on `bg-muted` measured **4.34:1 — already below the AA 4.5 floor v3 mandates**
    ("muted text floor: ≥ 4.5:1 on its actual surface"), before v4 touched anything. Darkening `--muted`
    would have pushed it to ~4.06. `--muted-foreground` `0.55 → 0.52` clears AA on all three surfaces it
    lands on. **This fixes a latent accessibility defect that shipped in M9.**
  - **Final tokens** (`:root`): `--background 0.995 → 0.966` · `--muted 0.96 → 0.932` ·
    `--muted-foreground 0.55 → 0.52`. `--card`/`--popover`/`--secondary`/`--accent`/`--border` untouched.
  - **Measured result — light now mirrors dark's real distances:**

    | gate | before | after | target |
    |---|---|---|---|
    | `card↔bg` | 0.54 | **3.89** | ≥3.0 (dark = 3.90) ✅ |
    | `bg↔muted` | 3.99 → 1.69 *(mid-fix)* | **3.89** | ≥2.5 ✅ |
    | `card↔muted` | 4.53 | **7.78** | dark = 6.94 ✅ |
    | AA mutedFg on muted | **4.34 ✗** | **4.53** | ≥4.5 ✅ |
    | AA mutedFg on card / bg | 4.87 / — | **5.52 / 5.01** | ≥4.5 ✅ |
  - **Verified:** tsc **0 errors** · lint clean · vitest **280 passed / 34 skipped** (`rls.test.ts` skipped
    — needs live Supabase; CSS change has no RLS surface). Dark tokens re-measured **identical** to
    baseline (`bg 4.37 · card 8.27 · popover 11.75 · muted 15.20 · mutedFg 67.44`). `transactions`
    sticky date header (`bg-background`) confirmed to sit on the page background, **not** inside a card —
    it still matches its backdrop exactly, no grey band.
  - **⚠️ Left open, needs a design-studio call (NOT in F1's scope):** light `--popover` is `lab 100` =
    **identical to `--card` (gap 0)**, so sheets/popovers do not separate from cards at all; dark gives
    them 3.48. Light cannot solve this by going lighter — `card` is already pure white — so it needs a
    real decision (tint the card, or rely on shadow/border), which is design authority, not a dev call.
  - *(superseded original brief text follows, kept for the reasoning)*
  - ~~**F1 — light theme has no surface layering** *(highest leverage — do this first)*.~~
  Measured: light `background lab 99.46` vs `card lab 100` = **0.54 apart**; dark = **3.90 apart**
  (`4.37` → `8.27`). **Light separates ~7× less than dark** — cards don't read as cards. v3 specced the
  dark ladder (`0.17 → 0.21 → 0.24`) and **never gave light one**; an omission, not a decision.
  Fix in `app/globals.css` `:root`: start at `--background: oklch(0.975 0.004 160)`, card stays
  `oklch(1 0 0)`, sheet/popover separates via border + existing `--shadow-soft`. **Keep hue 160** — warm
  off-white fights the emerald brand.
  **Acceptance: measure, don't eyeball** — light `background` vs `card` ≥ **3.0 lab L** apart (same
  perceptual band as dark's 3.90), verified via computed values in-browser.
- [x] **F2 — amount input: invisible in light, boxed in dark** — **DONE 2026-07-20**
  (`components/quick-add-card.tsx`). Home's amount field now uses the **same wrapper as the sheet**
  (`rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring`), so one value is
  entered through one affordance. `dark:bg-transparent` added so the base `dark:bg-input/30` can no
  longer be the only thing drawing a box in dark. **Verified in-browser (light):** wrapper border
  present, wrapper bg `lab 96.11` inset against the `lab 100` card, plus a screenshot showing the boxed
  field with its focus ring — compare the pre-fix capture where the number floated with no container.
  - 🔍 **Second defect found while fixing this — same class-collision family, now fixed:** the shadcn
    `Input` base carries **`md:text-sm`**, and a media-query rule outranks the unprefixed `text-4xl`, so
    **the amount rendered at 14px on any viewport ≥ md** while its `฿` prefix (a `span`, no `md:`
    override) stayed 30px. Desktop showed a big ฿ next to a tiny number. Fixed by adding `md:text-4xl`
    (Home) and `md:text-3xl` (`transaction-form.tsx`). Measured after: input **36px**, `md:text-sm`
    correctly dropped by `tailwind-merge`. **This was pre-existing — not introduced by v4.**
  - 🔴 **Repo gotcha discovered (added to the gotchas section below): Turbopack served a stale build
    across a full dev-server restart.** The edit was on disk and `tailwind-merge` was proven correct in
    isolation, yet the DOM kept the old class for three reload/restart cycles. Only `rm -rf .next` fixed
    it. Budget for this before debugging a "class that won't apply".
  - *(superseded original text follows, kept for the reasoning)*
  - ~~**F2 — amount input: invisible in light, boxed in dark** — **a bug, not a style choice.**~~
  🔧 **CORRECTION 2026-07-17 (this brief originally named the wrong file — found while doing F1).**
  The naked input is **`components/quick-add-card.tsx:48`** (Home). **`components/transaction-form.tsx:149`
  is already correct** — the sheet's amount field wraps its input in `rounded-md border bg-background px-3`
  with a `focus-within` ring. **Do not change the sheet.**
  This makes F2 **worse than first stated:** the same value (amount) is entered through **two inputs with
  two different affordances** — bordered in the sheet, invisible on Home — *and* the Home one changes
  appearance between themes. **The inconsistency is the defect; the theme asymmetry below is its
  mechanism.** Fix Home to match the sheet.
  `components/quick-add-card.tsx`'s amount input has deliberate overrides
  (`border-0 bg-transparent px-0 text-4xl font-semibold tabular-nums shadow-none` = intent is a naked big
  number), but the shadcn base `dark:bg-input/30` sits ahead of them and the `dark:` variant beats the
  unprefixed `bg-transparent`. Measured in light: `borderWidth: 0px`, `background: rgba(0,0,0,0)`,
  `box-shadow` fully transparent → **zero visual presence on the most important control in J1 (< 10 s log)**.
  **Fix:** keep the naked number (matches the override intent + v3's one-focal-number rule) → **remove
  `dark:bg-input/30` from this input**; then give it a **1px `--border` bottom rule in both themes** and
  keep the existing `focus-visible` ring. Zero affordance in a timed journey is a missing control, not
  minimalism. Both themes must render the same affordance.
- [x] **F3 — no middle type tier; rank-bearing text painted muted** — **DONE 2026-07-20**
  (`components/home-today-list.tsx`). Home's ladder was `36 → 14` with nothing between, and four ranks
  shared `muted-foreground`. Now: section heading `รายการวันนี้` → **16px / 600 / `foreground`** (was
  14px/600/muted — a heading dressed as a caption); primary row content (label + row amount) → **16px**;
  `muted-foreground` + small kept for the genuinely secondary rank (category chip, timestamp).
  **Measured after:** heading `16px / 600 / lab 7.07`, label `14px / 400 / lab 44.25`, focal
  `36px / 700 / lab 7.07 + tabular-nums`. Ladder is now **36 → 16 → 14 with distinct colours**.
  ✅ **Focal untouched**, exactly as the brief warned. No new elements — this adds contrast between
  ranks, so v3's density budget is unchanged.
  - *(superseded original text follows)*
  - ~~**F3 — no middle type tier; rank-bearing text painted muted.**~~
  Measured on Home: focal `36px/700/lab 7.07`, then **everything else `14px` at `lab 47.73`** — ยอดรวมทุกบัญชี
  (14/400) · เดือนนี้ใช้ไป (14/400) · **รายการวันนี้ (14/600 — a section heading dressed as a caption)** ·
  ยังไม่มีรายการวันนี้ (14/400). The ladder is `36 → 14` with **nothing between**: v3 specced "base 16 ·
  secondary 14" and `globals.css` sets `body { font-size: 1rem }` correctly, but every Home element is
  overridden to `text-sm`, so **the 16px tier exists nowhere on screen**. Four ranks share one colour.
  **Fix:** section headings → `16px/600/foreground`; primary row content (transaction name, account name)
  → `16px/foreground`; reserve `muted-foreground`+14px for genuinely secondary text (labels, timestamps,
  meta). Adds contrast *between ranks* — **not** more elements; v3's density budget is unchanged.
  ⚠️ **Do NOT touch the focal number.** At `36px/700/tabular-nums` it already implements v3 exactly. An
  earlier v4 draft assumed it was too small; measurement disproved it. Don't re-propose it.
- [x] **F4 — empty states are bare text; the mascot is idle** — **DONE 2026-07-20.**
  Home's empty state now shows `shrug` above the copy (`components/home-today-list.tsx`), and **J4
  first-run** — the journey the brief names explicitly — shows `thinking` in the guided
  create-first-account sheet (`components/first-account-sheet.tsx`). Neither is a celebratory
  expression: the brand rule that the mascot never applauds still holds, and the Home **hero** stays
  mascot-free per v3 (J1 is speed; only the empty list, which has nothing to be fast about, gets it).
  - 🔴 **Bug found and fixed while doing this — it affected code that shipped in M9, not just the new
    usages:** the mascot SVGs hardcode a `#141414` stroke on a `#ffffff` body, so on the dark theme's
    `~#0a0d12` surfaces **the linework vanished and the mascot rendered as a smudge** (verified by
    screenshot, before/after). Fixed centrally with `dark:invert` in `components/mascot.tsx`, so the
    **pre-existing** dark-theme mascots on `/transactions`, the recurring form and `budget-bar` are
    fixed too. Verified in dark: light lines on a dark body, monochrome and on-brand.
  - **Scope note for the reviewer:** F4 grants *permission*, not an obligation — ~10 other empty states
    (accounts, budgets, groups, sessions, invest, …) are eligible but were **deliberately left alone**;
    only the two the brief names were changed. Adding the rest is a design call, not a bug.
  - *(superseded original text follows)*
  - ~~**F4 — empty states are bare text; the mascot is idle.**~~ `ยังไม่มีรายการวันนี้` is 14px muted text in
  a box that F1 makes nearly invisible. Eight expressions already live at `project/jodsa/public/mascot/`
  wired through `components/mascot.tsx`. v3 banned the **mascot hero on Home** — that was about
  *placement*, not the asset.
  **Fix:** mascot permitted **only** in empty states · first-run/J4 guided account creation ·
  parse-success (J2) · error states; paired with one plain-language line, plus v3's inline **"+ สร้าง…"**
  action where an empty list blocks a journey (empty-source rule — unchanged).
  **Still banned:** mascot on Home, on any populated list, or inside any timed journey.
- [x] **F5 — typeface `IBM Plex Sans Thai` → `IBM Plex Sans Thai Looped`** — **DONE 2026-07-20**
  (`app/layout.tsx`). **Both gates the brief demanded were checked before committing, not assumed:**
  (a) the family exists in `next/font/google` at **exactly the weights in use** — verified against
  Next's own `font-data.json`: `IBM Plex Sans Thai Looped | 100,200,300,400,500,600,700`, identical to
  the outgoing cut, so 400/500/600/700 is a like-for-like swap; (b) **`tabular-nums` still applies** —
  measured on the focal balance after the swap: `font-variant-numeric: tabular-nums`. Neither gate
  failed, so no revert was needed and **no third font was substituted**.
  Verified live: `font-family` resolves to `"IBM Plex Sans Thai Looped"`; same family ⇒ metrics carry
  over ⇒ no relayout (screenshots before/after show identical layout, warmer Thai glyphs).
  - *(superseded original text follows)*
  - ~~**F5 — typeface `IBM Plex Sans Thai` → `IBM Plex Sans Thai Looped`** (`app/layout.tsx`).~~
  Not a defect — a voice mismatch: Plex is IBM's corporate face (precise, cool); JodSa is personal money
  for general Thai users. Same family ⇒ x-height/metrics/line-height carry over ⇒ drop-in
  `next/font/google` swap with **no relayout risk** on a shipped app, while looped Thai glyphs read
  warmer and more native. (A humanist face like Anuphan is a bigger warmth jump but changes metrics —
  not justified by v4.)
  **Verify before committing:** (a) family actually available via `next/font/google` at the weights in
  use, and (b) `tabular-nums` still applies to amounts. **If either fails → stay on `IBM Plex Sans Thai`
  and report back. Do not silently substitute a third font.**

- [x] **F6 — J1 waits on a network round-trip before it says "saved"** — **DONE 2026-07-20.**
  **Shape of the fix (the brief did not anticipate this):** the write could not stay in
  `TransactionForm`. Radix unmounts sheet content on close, so an action owned by the form would be torn
  down the instant the sheet closes — and closing instantly is the whole point — leaving **neither
  rollback nor `toast.error` able to run**. The mutation therefore lives above the form:
  - **`lib/pending-tx.ts`** (new) — pure orchestration: add provisional row → call → **remove on every
    path** → success toast, or error toast + restore. Pure so the contract is testable without a DOM.
  - **`components/pending-tx-provider.tsx`** (new) — holds `pending[]`, owns the request, outlives the sheet.
  - **`components/app-shell.tsx`** — wraps the shell; `onFailure` re-opens the sheet with the values.
  - **`components/transaction-form.tsx`** — new `optimistic` prop; **only `AppShell` passes it**, so edits
    and slip-import confirms stay on the blocking path exactly as the brief requires.
  - **`components/home-today-list.tsx`** — renders provisional rows subdued (`opacity-60`), **not
    tappable** (no saved record to open yet), no spinner, no motion.
  - **`lib/quick-add.ts`** — `QuickAddPrefill` widened to the full field set (`TxFormValues`) so a failed
    save can hand everything back, not just amount+type.
  - **i18n:** added `dashboard.pendingSave` + `transaction.invalidAmount` to **both** `th.json` and `en.json`.
  **Verified — and read the honest split here:**
  - ✅ **In-browser, real save:** balance moved `฿65,248.06 → ฿65,247.06`, sheet measured
    `data-state="closed"` immediately on submit (it does close instantly), real row rendered after.
  - ✅ **In-browser, forced failure** (dev server stopped mid-flow, so nothing could be written): error
    toast `"Failed to fetch"` shown, **sheet re-opened with the amount `99.00` still in it**, row count
    back to 1 with no phantom, balance untouched. That is rule 4 and rule 3 demonstrated on the real UI.
  - ⚠️ **The provisional row was never captured on screen.** On failure the fetch rejects almost
    instantly and React batches add+remove into one commit, so it never paints; on success it paints for
    only the round-trip. Three attempts to sample it froze or timed out the renderer. **Proven instead by
    `tests/unit/pending-tx.test.ts` (8 tests, all passing)** — including an in-flight assertion that the
    row **is** present between dispatch and resolution, plus: removed on success, removed + restored on a
    rejected write, removed + restored on a thrown request, non-`Error` throws, and the invariant that a
    run never both succeeds and restores. **Read that as: the state machine is proven, the pixel is not.**
  - ✅ tsc **0 errors** · lint clean · vitest **288 passed / 34 skipped** (was 280 — the 8 new ones).
  **⚠️ Left for the owner — test data:** verifying the real-save path wrote **one ฿1.00 expense on
  account `make`, dated 2026-07-20 ~23:49**. Browser tooling stopped responding before it could be
  removed. **Please delete it** (รายการ → tap the row → ลบ) — it is the only residue of this session.
  **Still open, explicitly not done here:** narrowing the 4× `revalidatePath` (`app/actions/transactions.ts:44-47`).
  Optimism now **hides** that latency; it has not been **removed**. Reporting it as masked, per the brief.
  - *(superseded original text follows, kept for the reasoning)*
  - ~~**F6 — J1 waits on a network round-trip before it says "saved"** *(added 2026-07-17)*.~~
  **Traced in code, not assumed:** Home's `บันทึก` doesn't save — it opens the sheet prefilled
  (`components/quick-add-card.tsx:30` → `openQuickAdd`). The sheet's `useActionState`
  (`components/transaction-form.tsx:100`) calls `createTransaction` (`app/actions/transactions.ts`), which
  validates → inserts through RLS → runs **`revalidatePath` on 4 routes** (`:44-47`) → only then resolves.
  The CTA sits disabled reading "กำลังบันทึก" (`:262`) the whole time. **J1 is the most repeated action in
  the product and its success criterion is < 10 s.**
  **Change — optimistic commit, scoped hard:**
  1. **J1 manual entry only.** On submit close the sheet immediately and render the row in "รายการวันนี้"
     in a **pending** state (subdued — not a spinner); on success it quietly becomes normal.
  2. ❌ **Never on J2 slip confirm.** The duplicate verdict is server-side (`23505` on
     `UNIQUE(user_id, ref_code)`, handled at `app/actions/transactions.ts:40`) and v3 specs a whole UI for
     it. Manual entry is safe *because* `ref_code` is null there, so that collision cannot fire.
  3. ❌ **The balance must not move optimistically.** The list records what the user did; the focal
     `ยอดรวม` is computed truth about money. A balance that jumps then reverts is alarming in a way a
     disappearing row is not — and it keeps v3's one-focal-number rule honest.
  4. **Failure costs the user nothing:** remove the pending row, keep the existing `toast.error`, and
     **reopen the sheet with every field still filled**. Re-typing an amount is worse than the wait this
     removes.
  5. Pending state is visual, not motion-heavy; respect `prefers-reduced-motion`.
  **Dev's call, not design's — but name it honestly:** the latency being masked is largely the 4×
  `revalidatePath` inside the action. Optimism *hides* it; narrowing the revalidation would *remove* it.
  Do either or both — but **do not report a masked slow write as a fixed one.**
  **Context for reviewers:** F6 is the *only* survivor of a list of perceived-performance techniques the
  owner raised. Rejected as serving no journey here: blur-up (no images), virtual lists (lists are short),
  prefetch (4 nav destinations). **Already shipped, needs nothing:** skeletons (`loading.tsx` × 4, ~23
  `animate-pulse`), toast-not-modal (`sonner` in `app/layout.tsx` + `toast.success/error` in the form),
  press physics (`.press`). A design-skill catalogue (`nutlope/hallmark`) was evaluated and **not
  adopted** — it targets AI-templated *landing pages*, while F1–F5 are structural bugs; mood-selected
  themes would also break the brief's own "every choice traces to a constraint" rule.

### Not defects — verified this pass, do NOT "fix"
- **Bottom nav is correct**: measured `position: fixed`, `bottom: 0px`, zero gap below. An earlier
  screenshot reading suggested it floated mid-screen; the computed values disproved it (the capture
  framed the whole window, not the viewport).
- **Focal number is correct** (see F3 warning above).
- **`components/transaction-form.tsx:149` (the sheet's amount field) is correct** — bordered wrapper +
  `focus-within` ring. Only Home's `quick-add-card.tsx:48` is naked (F2 correction above).
- **Skeletons, toast-not-modal and press physics are already shipped** and were re-verified this pass —
  do not "add" them (F6 context).

### Known gap in this brief
Mobile-viewport density was **not** verified — viewport emulation on the review machine was unreliable
(`outerWidth 1463` vs `innerWidth 268`; DevTools/zoom interference). The mobile bottom nav (4 + centre ＋)
was seen rendering per v3, but per-screen density on a real phone viewport is **unchecked**. This does
not block F1–F5 — all five are token/class-level and viewport-independent. Flag anything density-related
you hit while implementing.

### New anti-patterns (additive to v3's list — full reasoning in § v4)
❌ Importing a marketing site's density into a tool screen (`themoneythings.com` is a landing page; take
its hierarchy rules, never its spacing-per-screen) · ❌ re-litigating v3's journeys on aesthetic grounds ·
❌ reintroducing gradients/hero blocks/blur as "making it prettier" · ❌ a control with zero affordance in
a timed journey · ❌ rank-bearing text painted `muted-foreground` · ❌ theme-asymmetric component styling
(a base `dark:` utility silently beating a local override) · ❌ shipping a colour/spacing change verified
by eye when it is measurable.

### pm-desk review verdict — **CHANGES NEEDED** — 2026-07-21 · from pm-desk
**Record:** `pm-desk/projects/jodsa/reviews/SPEC-5-review.md` (full evidence). **Reviewed at** `21cbff5`.
**Gates re-run independently:** `npx tsc --noEmit` exit 0 · `npx next lint` clean · `npx vitest run`
**288 passed / 34 skipped** (34 = `rls.test.ts`, needs live Supabase) — all three match the dev's report.

**F1–F5 APPROVED.** F1's acceptance number was re-derived from the tokens on disk, not accepted on
report: light `card↔bg` **3.89** (≥ 3.0 ✅), AA `muted-foreground` **5.51 / 5.00 / 4.52** on
card/bg/muted (all ≥ 4.5 ✅), and the pre-existing M9 violation re-measures at **4.33:1** — the dev found
and fixed a real latent a11y defect. "Dark untouched" is proven from the diff (`a5d8169` is entirely
inside `:root`; `.dark` has zero changed lines). F5's font gate re-confirmed against Next's own
`font-data.json` (`IBM Plex Sans Thai Looped` → 100–700, identical to the outgoing cut). F4's
`dark:invert` survived a falsification attempt: brand emerald (`#159E7B`) exists **only** in
`mascot-app-icon.svg`, which `MascotExpr` cannot address — the six reachable expressions are strictly
`#141414` + `#ffffff`, so the "monochrome, light untouched" claim holds. F2's deviation (full bordered
wrapper instead of the brief's bottom rule) is **accepted** — it follows the brief's own later correction
("fix Home to match the sheet's affordance"), which supersedes the earlier decision paragraph.

**F6 is NOT done — one blocking defect.**

- [x] **SPEC5-1 — FIXED 2026-07-21** (`components/transaction-form.tsx` + `lib/quick-add.ts`).
  **Root cause confirmed independently before fixing** (not taken on pm-desk's word): `fillFormData`
  rewrites `datetime` to a UTC ISO string for the server, and the restore payload was rebuilt by reading
  that **already-mutated** FormData. Reproduced the transform in isolation —
  `2026-07-20T23:49` → `2026-07-20T16:49:00.000Z`, which fails
  `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/`, so `<input type="datetime-local" required>` rejected it and
  re-rendered blank.
  **Fix — two layers, because the class matters more than the instance:**
  1. *Source:* the restore snapshot is now taken **before** `fillFormData` runs. The restore payload and
     the server payload are two different contracts and are now built separately.
  2. *Class:* every restore `datetime` also passes through a new pure `toDatetimeLocal()`
     (`lib/quick-add.ts`), which coerces any datetime into the one format the control accepts and returns
     `undefined` rather than an unusable string. **This makes caller ordering non-load-bearing** — if a
     future edit reads the value post-mutation again, it is still repaired.
  **Directly answers pm-desk's structural point.** The observation that `pending-tx.test.ts` treats
  `restore` as opaque and asserts identity — so it *cannot* reach a caller-side defect — was correct, and
  so was the note that the earlier browser check verified only `amount`, the one field that happened to
  work. New suite `tests/unit/restore-values.test.ts` (7 tests) covers that seam: identity, seconds
  trimming, the exact UTC-ISO bug string, a **timezone-independent round-trip** (`local → server ISO →
  restore` must return the value the user typed — this *is* the post-mutation path), a guard that no
  output can ever be rejected by the control, unusable input dropped, and a guard against the obvious
  regression of using `getUTC*` instead of local components.
  **Verified live (all three fields this time, not just amount):** dev server stopped so the write could
  not succeed → sheet re-opened with `amount 42.00` · **`datetime 2026-07-21T01:06`** ·
  `counterparty ร้านทดสอบ` all intact, `checkValidity()` **true**, field **not** empty, `Failed to fetch`
  toast shown. Nothing was written to the ledger by this check.
  **Gates:** tsc **0** · lint clean · vitest **295 passed / 34 skipped** (was 288 — the 7 new).
  **Still open:** `SPEC5-2`, `SPEC5-3`, `SPEC5-4` (minor, untouched) and the qa-lab **`QA-SPEC5`** E2E
  that pm-desk requires before SPEC-5 can close — this fix does not substitute for it.
  - *(original pm-desk brief follows)*
  - ~~[ ] **SPEC5-1 — BLOCKING. The F6 rollback loses the user's date, violating F6 rule 4 and the v4
  anti-pattern "a failed write that costs the user their typed input".**
  **Mechanism (traced, not inferred):** `components/transaction-form.tsx:133` runs `fillFormData(fd)`
  first, which mutates the FormData in place — `fd.set('datetime', dt.toISOString())` (line 127). The
  optimistic branch then builds its restore payload by reading that **already-mutated** FormData:
  `datetime: (fd.get('datetime') as string)` (line 164). So `onFailure` receives a **UTC ISO string**
  (`2026-07-20T16:49:00.000Z`), which `AppShell.restore` feeds back into
  `<Input type="datetime-local" … required />` (lines 313–317). `datetime-local` accepts only
  `YYYY-MM-DDTHH:mm[:ss]`, so the browser rejects it and the field comes back **blank** — and it is
  `required`, so the user cannot just resubmit. Even if the format parsed, it is UTC where the control
  expects local: a 7-hour shift in Asia/Bangkok.
  **Repro:** open quick-add from Home, fill amount + set a datetime, stop the dev server, submit → error
  toast fires and the sheet reopens with the amount intact but **the date field empty**.
  **Why nothing caught it:** `tests/unit/pending-tx.test.ts` passes `restore` as an opaque
  `{ amount: '120.00' }` and asserts object identity — the defect is in how the payload is *constructed*
  in `transaction-form.tsx`, a seam `lib/pending-tx.ts` never sees, so the 8 tests are structurally
  incapable of reaching it. The in-browser failure check verified one field (amount), and amount is the
  field that works.
  **Fixed =** the restore payload carries the raw `datetime-local` string the user typed (capture it
  before `fillFormData`, or restore from the local value rather than the mutated FormData), **and** a test
  asserts a restored payload is a valid `datetime-local` value in the app's timezone.~~

- [x] **SPEC5-2 — FIXED 2026-07-21** (`app/globals.css`). The `:root` comment now states the real
  numbers. **And the first correction was itself wrong**, which is worth recording: writing pm-desk's
  derived `7.77` produced a comment that still disagreed with the browser's **7.78**. An oklch→Lab hand
  derivation and the browser's own colour pipeline land ~0.01 apart — that gap is exactly how the
  original stale figures survived. The comment now carries the **browser-computed** values
  (`card↔bg 3.89 · card↔muted 7.78`) *and names the method*, so the next reader can reproduce them
  instead of re-deriving a different answer.
  - *(original pm-desk brief follows)*
  - ~~[ ] **SPEC5-2 — minor.** The `:root` comment in `app/globals.css` states "light card↔bg **3.70** ·
  card↔muted **7.20**", but the shipped tokens measure **3.89 / 7.77** (matching this brief's own table,
  not the comment). Stale numbers from an earlier iteration, left where a future reader will trust them.
  **Fixed =** the comment states the real measured values.~~

- [x] **SPEC5-3 — FIXED 2026-07-21** (`components/pending-tx-provider.tsx`). The default context no
  longer silently no-ops: `submit` **throws** with a message naming the cause, while `pending` still
  reads as an empty array (a consumer rendering provisional rows outside the provider should show none,
  not crash). Rationale kept in the code: `transaction-form.tsx` calls `onSuccess?.()` immediately after
  `submit`, so a no-op meant *the sheet closes reporting success while the transaction is discarded*.
  Unreachable today — `optimistic` has exactly one call site and `AppShell` mounts the provider — but a
  finance app should fail loudly rather than quietly lose a write. **Not unit-tested:** the guard lives
  in a React context default and this repo has no DOM test environment (adding one needs an owner-approved
  dependency); tsc covers the type and the path is unreachable by construction.
  - *(original pm-desk brief follows)*
  - ~~[ ] **SPEC5-3 — minor, hardening.** `usePendingTx()` falls back to `noop` (`submit: () => {}`) when used
  outside `PendingTxProvider`, while `transaction-form.tsx:167` calls `onSuccess?.()` unconditionally
  after `pendingTx.submit(...)`. Unreachable today (only `AppShell` passes `optimistic`, and it provides
  the provider) — but if that pairing is ever broken, the sheet closes reporting success and **the
  transaction is silently discarded**. That landmine should not stay armed in a finance app.
  **Fixed =** the default context throws (or dev-warns) instead of silently no-oping.~~

- [x] **SPEC5-4 — FIXED 2026-07-21** (`components/home-today-list.tsx`), and it was **not** a deliberate
  deviation. pm-desk left it open as "possibly intentional"; checking v3 settles it —
  `idea-forge/ideas/jodsa/docs/07-design.md:364` reads *"12 px only for chart axes. (v2 allowed 12 in UI
  — a squint source.)"*, so 12px UI text is a **direct v3 violation**, pre-dating F3. All four
  `text-xs` → `text-sm` on Home. **Verified in-browser: 0 elements at 12px remain on Home**, secondary
  tier measures 14px. Home's ladder is now **36 → 16 → 14** as F3 specifies. The stale "muted + small"
  comment was updated too, so it does not become the next SPEC5-2.
  - *(original pm-desk brief follows)*
  - ~~[ ] **SPEC5-4 — minor, possibly an intentional design call.** F3 specifies the secondary tier as
  `muted-foreground` + **14px** and names timestamps; Home ships timestamp + category chip at `text-xs`
  (**12px**), so the shipped ladder is 36 → 16 → 12 and the 14px tier still does not exist on Home.
  Pre-existing, not introduced by F3. **Fixed =** either move them to `text-sm`, or record it as a
  deliberate deviation so the next reader does not re-open it.~~


**Residuals — assessed, and what happens to each:**
- **The ฿1.00 test expense on account `make` (2026-07-20 ~23:49) blocks nothing here** — it affects no
  verdict, gate or test. But it is real: a dev session wrote into the owner's live ledger and could not
  clean up, so the owner's balance is off by ฿1.00 until deleted manually (รายการ → tap the row → ลบ).
  pm-desk cannot verify whether it is still present (no DB access, not authenticated). Use a disposable
  test account for live-path verification next time.
- **Light `--popover` == `--card` (gap 0) — pm-desk AGREES with the dev, including with escalating it.**
  Confirmed independently: both `oklch(1 0 0)` → lab 100.00, gap **0.00**, versus dark's popover↔card
  **3.48**. It cannot be fixed by going lighter (card is pinned to pure white), so the options are
  tinting `--card` or committing to shadow+border alone — brand/visual-language calls above dev
  authority. **Routed to design-studio; NOT a dev correction item and not held against this delivery.**
- **`revalidatePath` ×4 not narrowed — no violation, no action in SPEC-5.** v4 demanded the dev "say which
  one shipped", and they said *masked*. Correct behaviour. Logged as forward tech-debt: the write is as
  slow as it ever was, and optimism now means nobody will feel it — which is exactly how such latency
  never gets fixed. Phase-2 item.

**Observation for qa-lab, not a dev fix:** the ＋ FAB opens quick-add from every page
(`app-nav.tsx:84`), but provisional rows render only on Home (`home-today-list.tsx`). Saving from
`/transactions` now closes the sheet instantly with no visible feedback until the toast lands, where it
previously held the sheet on "กำลังบันทึก". Spec-compliant (F6 scopes the row to "รายการวันนี้") but a real
behaviour change outside Home.

**SPEC-5 stays OPEN.** Closure needs **SPEC5-1 landed** *and* a **qa-lab E2E (`QA-SPEC5`)** covering:
(i) optimistic save — provisional row paints, subdued, not tappable, **balance does not move**;
(ii) forced failure — row rolls back, error toast, sheet reopens with **every field intact, datetime
included**; (iii) slip-import confirm and edit still block (no optimism); (iv) contrast + mascot in both
themes, including the mobile viewport the v4 brief itself left unchecked. **8 unit tests over a pure
orchestrator are not sufficient evidence for a change to J1** — this review is the demonstration.

---

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
