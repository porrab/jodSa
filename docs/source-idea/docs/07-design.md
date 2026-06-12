# Design Direction — JodSa (jodsa)

> A privacy-first finance PWA for everyday Thai users who log income/expense/transfer on the go —
> mostly by sharing a bank slip. The design must feel **calm, trustworthy, and effortless**: money
> data feels safe (parsed on-device, never uploaded), and logging takes seconds, not focus.
> Source blueprint: idea-forge/ideas/jodsa/ · Drafted 2026-06-09

## Design Premise

JodSa is a careful person's money companion, not a flashy fintech product. Its hero moment is
"share a slip → confirm in under 10 seconds," done one-handed on a phone, in Thai. Every screen
should lower friction and raise trust. The feeling to protect across the whole app: *quiet
confidence* — the user believes their data is private and the app won't waste their attention.

## Visual Language

- **Mood:** calm · trustworthy · effortless · uncluttered
- **Style:** Soft-minimal. Generous whitespace, rounded cards, restrained color, content-first.
  A "calm banking companion" look — quietly modern, never loud. *Reason:* the users are careful
  savers tracking real money; the design must read as safe and low-effort, not exciting.
- **Reacting against:**
  - Neon-gradient crypto/fintech aesthetics — read as *speculative/risky*, wrong for a savings tool.
  - Dense spreadsheet dashboards — intimidating and slow; this app's job is *less* friction.
  - Cute gamified piggy-bank styling — undercuts trust when real money is involved.

## Color System

> Replaces the current **stock shadcn "new-york / slate"** tokens (a generic grayscale default, not a
> brand). Values stay in **OKLCH** to match the existing `globals.css`. Tune in implementation; these
> set the direction.

**Brand identity choice:** a calm **emerald/teal** primary — signals money, growth, and calm, and
deliberately does **not** mirror any single Thai bank (SCB purple / KBank green / KTB·BBL blue /
PromptPay blue). JodSa aggregates many banks, so it owns a neutral-but-warm identity and lets
per-account colors live *inside* it.

| Role | Light (OKLCH) | Dark (OKLCH) | Reason / contrast |
|------|---------------|--------------|-------------------|
| **Primary / brand** | `0.55 0.11 162` | `0.70 0.12 162` | Calm emerald = growth + trust; not a bank's color |
| **Primary CTA (Save/Confirm)** | primary, hover `0.50 0.12 162` | primary, hover `0.75 0.12 162` | The one action color; high contrast on surface |
| **Surface / background** | `0.995 0.003 160` warm near-white | `0.17 0.02 260` deep ink | Calm, high legibility; warm-neutral, not cold gray |
| **Card** | `1 0 0` | `0.21 0.02 260` | Subtle lift from background |
| **Text (foreground)** | `0.20 0.03 260` | `0.97 0.005 250` | Body ≥ WCAG AA on its surface |
| **Muted text** | `0.55 0.02 260` | `0.70 0.03 256` | Secondary labels; still AA |
| **Destructive (delete / over-budget)** | `0.577 0.245 27` | `0.70 0.19 22` | Strong red — reserved, not for ordinary expense |

**Transaction-type semantics (a hard product rule, encoded as color):** income, expense, and transfer
must be **three distinct, consistent colors**, and **transfer must read as neutral — never red** —
because the plan explicitly excludes transfers from expense and budget math. A transfer is *movement,
not loss*.

| Type | Color (light · dark) | Reason |
|------|----------------------|--------|
| **Income** | `0.60 0.13 155` · `0.72 0.14 155` (green) | Positive, aligns with brand family |
| **Expense** | `0.62 0.17 35` · `0.70 0.16 35` (warm coral) | Negative but *calm* — daily spend is normal, not an error |
| **Transfer** | `0.62 0.04 250` · `0.72 0.04 250` (neutral slate-blue) | Desaturated on purpose: "not a loss" |

> Keep expense as a **muted coral**, distinct from the stronger `destructive` red, so ordinary
> spending never looks like an alarm or a mistake.

## Typography

> **Fixes a current bug:** `app/layout.tsx` loads `Geist` with `subsets: ['latin']` only — **Geist has
> no Thai glyphs**, so Thai text currently falls back to a system font. JodSa is Thai-first; this must
> change.

- **UI + Body + Headings:** **IBM Plex Sans Thai** — humanist, warm, first-class Thai + Latin coverage,
  free on Google Fonts, good weight range. *Reason:* warmth + trust + readability for a Thai-first
  finance tool; one family keeps the PWA lean. *(Alternative if a more neutral tone is wanted: Noto
  Sans Thai + Noto Sans.)*
- **Numbers are first-class.** Amounts and balances are the most-scanned content. Use
  **`font-variant-numeric: tabular-nums`** everywhere money appears, so digits align in lists and
  don't jitter as values change. *Reason:* finance legibility — non-tabular figures shift and misread.
- **Type scale:** 12 / 14 / 16 / 20 / 24 / 32 / **40** (40 = the hero amount on the log/import screen).
- **Weights:** 400 body · 500 labels · 600 headings & amounts.

## Spacing & Layout

- **Density:** airy but efficient — calm, never cramped. *Reason:* lowers cognitive load for a
  do-it-fast tool.
- **Base unit:** 4px (Tailwind default — consistent with current build).
- **Radius:** bump `--radius` from `0.5rem` → **`0.75rem`** for a softer, calmer card feel.
- **Form factor:** **mobile-first PWA, one-handed.** Primary actions live in the **bottom third
  (thumb reach)**.
  - **Bottom tab bar** for core destinations with a prominent **center Add/Scan** action — logging is
    THE job, so "add" is one tap from anywhere.
  - **Bottom sheets** (slide up) for pickers and the log form — reachable; **not** centered modals.
- **Desktop:** same content in a centered max-width column (phone layout scales up; PC is for review
  and charts, M5).

## Motion

- **Restraint: purposeful / minimal.** Trust comes from calm, not animation.
- **Earns its keep at:** (1) **slip-parse success** — a quiet check + fields fading in, reassuring the
  on-device parse worked; (2) **balance/amount update** — a subtle highlight so a changed number is
  noticed. Bottom sheets slide; everything respects `prefers-reduced-motion` (swap to instant).
- **Never:** confetti or celebratory animation on spending. This is a *savings* tool.

## Key Screens

**Bottom navigation (global)**
```
┌─────────────────────────────────────────┐
│                content                   │
│                                          │
├─────────────────────────────────────────┤
│  🏠 Home   📊 Budgets  ( ＋ )  📜 History  ⚙︎ │  ← center ＋ = Add/Scan, thumb-reach
└─────────────────────────────────────────┘
```

**Add / Log — the hero (<10s)**
```
[ บันทึก / Log ]
┌──────────────────────────────────────────┐
│   ฿  [ 0.00 ]            ← 40px tabular    │  the one thing that matters, on top
│  ( รายรับ )( รายจ่าย )( โอน )  ← color-coded │  income green · expense coral · transfer neutral
│   หมวด    [ อาหาร ▾ ]                      │
│   บัญชี    [ KBank ● ▾ ]   ← account color  │
│   โน้ต     [ ................. ]            │
├──────────────────────────────────────────┤
│            [  บันทึก  ]        ← sticky CTA │  bottom, thumb-reach
└──────────────────────────────────────────┘
(transfer mode swaps "บัญชี" for  จาก ● ▾  →  ไป ● ▾)
```

**Slip Import / Confirm (`/import`)**
```
[ ตรวจสลิป ]
┌──────────────────────────────────────────┐
│  🔒 อ่านบนเครื่องคุณ · ภาพไม่ถูกอัปโหลด      │  ← privacy promise, visible (not buried)
│   ฿  [ 1,250.00 ]        ← parsed, editable │
│   วันที่  [ 9 มิ.ย. 2026 ]                  │
│   บัญชี  [ ⚠ ตรวจสอบ ▾ ]  ← low-confidence flag │
├──────────────────────────────────────────┤
│            [  ยืนยัน  ]                     │
└──────────────────────────────────────────┘
```

**Home / Dashboard**
```
┌──────────────────────────────────────────┐
│  ยอดรวมทุกบัญชี   ฿ 24,300.00  ← tabular    │
│  เดือนนี้:  รายรับ ▲12,000   รายจ่าย ▼8,200 │  green / coral
│  ┌─ งบเดือนนี้ ─────────────┐               │
│  │ อาหาร   ▓▓▓▓▓░░  -320     │  ← budget +/- │
│  └──────────────────────────┘               │
│  รายการล่าสุด …                             │
└──────────────────────────────────────────┘
```

**Guest Pay (`/pay/<token>`, logged-out)** — minimal, trust-forward: host's QR + "upload your slip";
clearly states it's *recorded, host confirms* (no fake "verified" badge).

## Core Components

- **AmountDisplay / AmountInput** — large, `tabular-nums`, ฿ prefix, satang-aware (baht at display).
- **TypeToggle** — segmented income/expense/transfer, color-coded; drives the form's mode.
- **AccountChip / AccountPicker** — per-account color dot + bank name.
- **BalanceCard** — account / total balance summary.
- **BudgetBar** — progress vs actual; calm under-budget, clear (not panic) over-budget.
- **TransactionRow** — type color stripe, amount (tabular), category, account, date.
- **ImportConfirmSheet** — parsed fields + confidence flags + the privacy note.
- **BottomNav + AddButton** — global nav with center add/scan.
- **BottomSheet** — thumb-reachable container for forms/pickers.
- **StickyConfirmBar** — bottom primary action on log/import.

## Anti-Patterns (avoid for this product)

- ❌ **Transfer styled like expense (red).** Transfer ≠ loss; the plan excludes it from expense/budget.
  Keep it neutral.
- ❌ **Gamifying/celebrating spending** (confetti on a big expense). Reward *saving / under-budget*
  calm — never overspending.
- ❌ **Latin-only font → broken Thai.** (Current bug: `Geist` latin-only.) Always a Thai-capable face.
- ❌ **Alarm-red for ordinary expense.** Daily spend is normal; reserve strong red for
  destructive/over-budget only.
- ❌ **Multi-step wizard for the core log.** The hero is <10s — one screen, only truly-required fields.
- ❌ **Looking like one specific bank** (SCB purple / KBank green / KTB·BBL blue). Own a neutral
  identity; let per-account colors live inside it.
- ❌ **Buried privacy / dark patterns.** The on-device, image-never-uploaded promise is visible at the
  scan step. No fake urgency, no hidden data-sharing toggles, no fake "verified" on guest payments.
- ❌ **Non-tabular figures** that make amounts jitter and misalign in lists.
- ❌ **Centered modals for input on mobile** (out of thumb reach). Use bottom sheets.

## Adoption Notes (current code, M1–M2 already built)

Two concrete changes to apply when adopting this direction:
1. **Font:** replace `Geist({ subsets: ['latin'] })` in `app/layout.tsx` with a Thai-capable family
   (IBM Plex Sans Thai), wired to `--font-sans`; add `tabular-nums` to amount/balance styles.
2. **Theme tokens:** replace the stock slate `:root` / `.dark` values in `app/globals.css` with the
   emerald-brand + transaction-type palette above; add the income/expense/transfer semantic tokens
   (they aren't in the default shadcn set) and bump `--radius` to `0.75rem`.
