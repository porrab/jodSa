# JodSa

> A low-friction personal finance tracking PWA that auto-reads Thai bank slips and tracks budgets.

## What This Is
JodSa lets you log income / expense / money-transfer by sharing a Thai bank or PromptPay slip from your gallery — the app reads it **entirely on-device** (QR + OCR in a Web Worker, image never uploaded, discarded after parsing) and fills in the transaction. It adds multi-bank accounts, daily/monthly budgets with +/- tracking, recurring expenses with per-weekday exclusions, grouped expenses (trips), and a guest "split-the-bill" session where friends open a link, see your bank QR, and upload their slip to be recorded. It is a multi-tenant, portfolio-grade app intended for real use by others. THB only, Thai/English, light/dark.

## Status
- Created: 2026-06-04
- Phase: **Blueprint complete — ready to build** (audit verdict: FIX BLOCKERS FIRST; both blockers resolved)

## Quick Start
To build this project, open a fresh Claude Code session in a new directory and paste the contents of [`prompt.md`](./prompt.md) as the first message.

## Documents
- [`prompt.md`](./prompt.md) — Handoff prompt for the build session (self-contained, includes all 3 SKILL.md)
- [`docs/01-definition.md`](./docs/01-definition.md) — Project definition
- [`docs/02-architecture.md`](./docs/02-architecture.md) — System design & stack (incl. resolved blockers + data model)
- [`docs/03-tools-skills.md`](./docs/03-tools-skills.md) — Tools & skills
- [`docs/04-roadmap.md`](./docs/04-roadmap.md) — Implementation milestones (M1–M5 + Phase 2)
- [`docs/05-risks.md`](./docs/05-risks.md) — Risk register
- [`docs/06-audit.md`](./docs/06-audit.md) — Architecture audit report

## Notes
- **Core MVP (3 things):** three log types (income/expense/transfer), AI slip reading (QR + free client-side OCR), budgets/goals with +/-.
- **Free by design:** no paid AI vision in MVP — slip parsing is QR decode + Tesseract.js on-device, so others can use it at zero cost to the owner. BYO vision key is a Phase 2 option.
- **Key security rule:** runtime user data flows only through supabase-js with the user session (RLS enforced); Drizzle/service-role are migrations-only and never touch user data on a request path.
- **Deferred to Phase 2:** real-time live sync, push notifications (PWA Web Push, via cron), BYO vision key, CSV export.
- Owner plans to design a mascot/icon for JodSa later.
