# JodSa (จดสะ)

> A low-friction personal finance tracking **PWA** that auto-reads Thai bank/PromptPay slips
> **entirely on your device** — the image never leaves your phone, and is discarded right after parsing.

**"จด"** = *to record* — the core action. Share a slip → the app fills in the transaction → you confirm. Done in under 10 seconds.

---

## What it does

- **Log three things:** income, expense, and money-transfer (between your own accounts).
- **Read Thai slips on-device:** QR decode + OCR (`tesseract.js`, tha+eng) in a Web Worker. **Zero server-side cost, no image upload.**
- **Multi-bank accounts** with per-account balances.
- **Budgets** (daily/monthly, overall/category) with live **+/- vs. actual spend**.
- **Recurring expenses** — subscriptions and weekly costs with per-weekday exclusions (e.g. "travel Tue–Thu + Sat").
- **Groups** (e.g. a trip): total + breakdown.
- **Guest split-the-bill:** friends open a link, see your bank QR, upload their slip → it's recorded (you confirm).
- Multi-tenant with real login (data fully isolated per user), THB only, **Thai/English**, light/dark theme, installable PWA.

## Tech stack

TypeScript (strict) · Next.js 15 (App Router) + React 19 · Supabase (Postgres + Auth + RLS + Storage) ·
Drizzle (migrations only) · Zod · TanStack Query · Serwist PWA · next-intl · next-themes · Tailwind + shadcn/ui ·
tesseract.js + jsQR/zxing (client-side) · Recharts (lazy) · Vitest + Playwright · deployed on Vercel + Supabase.

> Money is stored as **integer satang** end-to-end. Slip parsing is **client-side only** by design (privacy + zero cost).

## Project status

🚧 **Skeleton scaffolded — not built yet.** Structure, role, and skills are in place; no application code has been written.

Build proceeds in five milestones, **in order**:

| Milestone | Scope |
|-----------|-------|
| **M1** | Foundation + Auth + Manual Logging (income/expense/transfer + balances) |
| **M2** | Slip Parsing (on-device QR + OCR) — *riskiest; needs a 25-slip corpus first* |
| **M3** | Budgets + Recurring + Groups |
| **M4** | Guest Group-Payment (capability-token RLS) |
| **M5** | Polish + i18n + Theme + Charts + Share Target |

See [CLAUDE.md](CLAUDE.md) for the full milestone list with acceptance criteria.

## Quick start

> Not runnable yet — the project still needs to be initialized.

```bash
# 1. Initialize the Next.js app (see START-HERE.md for the exact dependency set)
npx create-next-app@latest .   # TypeScript, App Router, Tailwind

# 2. Add the stack deps (Serwist, Supabase, Drizzle, Zod, TanStack Query,
#    next-intl, next-themes, shadcn/ui, tesseract.js, the QR lib) at React 19 / Next 15-compatible versions

# 3. Copy env and fill in your Supabase keys
cp .env.example .env.local

# 4. Run migrations (RLS policies included), then start the dev server
npm run dev
```

The dev session should **confirm the resolved dependency versions before writing M1 feature code.** See [START-HERE.md](START-HERE.md).

## Structure

```
app/            Next.js routes — (auth), (app) pages, guest /pay/[token], /import, API
components/     UI: transaction form, slip dropzone, budget bar, recurring form, charts (lazy)
lib/            slip parser, recurrence engine, money helpers, supabase clients, Zod validators
db/             Drizzle schema + SQL migrations (RLS policies)
workers/        slip.worker.ts — on-device QR + OCR, off the main thread
messages/       th.json / en.json (next-intl)
tests/          Vitest unit + Playwright e2e
.claude/skills/ slip-parser · recurrence-engine · supabase-rls
docs/source-idea/  the original idea-forge blueprint (provenance)
```

## Provenance

Scaffolded by **Dev Kit** from the idea-forge blueprint. The full original plan lives in
[docs/source-idea/](docs/source-idea/) — `prompt.md` is the finalized handoff, with definition,
architecture, roadmap, risks, and the architecture audit alongside it.
