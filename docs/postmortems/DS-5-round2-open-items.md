# DS-5 round 2 — remaining visual gaps and clean typecheck

## Summary

The DS-5 round-2 review found four remaining visual mismatches in shared tabs, slip confirmation, accounts, and investments, plus a clean-TypeScript configuration gap that could compile stale `.next` worker artifacts. Commit `581cc5e` removes the mismatches, limits TypeScript's generated-file inputs to `.next/types`, and adds a focused 390×844 E2E/visual gate.

## Symptom

- Active `SegmentedItem` controls retained a raised `shadow-soft` surface.
- Slip confirmation displayed `พร้อม` and a local filename instead of parsed bank/reference metadata.
- `/accounts` rendered its count caption at the same 28/700 hierarchy as the total.
- `/invest` used stacked badges in holding rows and rendered the portfolio total at 18/600.
- The independent review reproduced TS2322 in a clean `tsc --noEmit --incremental false` run when `.next/static/media/slip.worker.*.ts` existed. The same command passed in this session before the config fix because the current build artifact set did not enter the program.

## Root cause

The visual items were incomplete implementations of the DS-5 component rules:

- `components/ui/segmented.tsx` unconditionally added the custom `shadow-soft` utility for every active item. Call-site `shadow-none` classes did not override that custom utility through `tailwind-merge`.
- `components/slip-confirm-form.tsx` reused queue-oriented copy and `imageFile.name` even though the parsed `bankCode` and `refCode` were already available on `ParsedSlip`.
- `app/(app)/accounts/accounts-client.tsx` interpolated the count and amount into one 28/700 paragraph.
- `app/(app)/invest/invest-client.tsx` modeled asset class, sleeve, and quantity as separate visual elements rather than one metadata sentence, while the total retained the older `text-lg font-semibold` style.

The typecheck gap came from `tsconfig.json` combining broad `**/*.ts` / `**/*.tsx` includes with no exclusions for `.next/static`, `.next/server`, or `.next/cache`. Incremental compiler state and the exact generated artifact set made the failure appear non-deterministically across working copies.

## Why it produced the symptom

Each UI component rendered exactly the hierarchy encoded in its classes, so the shared shadow and per-screen typography diverged from the Figma frames even though the data was correct. For typecheck, a stale copied worker file could be treated as a second global TypeScript script, creating a conflict at the worker message boundary; when that artifact was absent from the compiler program, the same source tree passed.

## Fix

Commit `581cc5e`:

- removes `shadow-soft` from the active `SegmentedItem` state;
- renders a localized `อ่านจากสลิปแล้ว` pill and `bank · เลขอ้างอิง` metadata with a masked reference;
- separates the muted account-count caption from its 28/700 total;
- renders holding metadata as `asset class · sleeve · quantity` and promotes the investment total to 28/700;
- excludes `.next/static`, `.next/server`, and `.next/cache` while preserving the explicit `.next/types/**/*.ts` include;
- adds `tests/e2e/ds5-open-items.spec.ts` and four Figma/app pairs.

## How it was found

The independent design-studio round-2 pairs made the four visual deltas deterministic. Source tracing mapped each delta to one class or rendering block. The typecheck report pointed to the generated worker copy; `--listFiles` was then used to verify the post-fix program boundary rather than relying on incremental success.

Two initial E2E expectations were rejected during validation: Chromium serializes an absent visible shadow as transparent zero-alpha shadow layers rather than always returning `none`, and the generated slip fixture identifies SCB rather than KBank. The final checks assert visible shadow alpha and the fixture's parsed bank.

## Why it slipped through

The prior visual pass covered the screens but did not assert the shared tab's computed style or the typography hierarchy at the affected seams. The previous slip row existed, so structural coverage passed without checking its semantic metadata. Typecheck normally ran incrementally, and CI did not pin the clean `--incremental false` command or generated-file boundary.

## Validation

- `pnpm exec playwright test tests/e2e/ds5-open-items.spec.ts --project=chromium`: 5 passed (setup plus C4, S2, S7, S9).
- DS-3 and Honey contrast E2E: 6 passed.
- Focused Honey visual baseline rerun without update mode: 7 passed.
- `pnpm -s vitest run`: 334 passed; 34 live-RLS tests skipped.
- `pnpm -s tsc --noEmit --incremental false`: exit 0.
- `pnpm -s tsc --noEmit --incremental false --listFiles`: under `.next`, only `.next/types/routes.d.ts` and `.next/types/validator.ts` were present.
- Four Figma-left/app-right pairs were inspected at `tests/e2e/evidence/ds-5-open-items-2026-10-25/pairs/`.

## Action items

- Keep the clean `--incremental false` typecheck in DS-5 handoffs and CI-oriented verification.
- N2–N5 remain separate low-priority follow-ups. F1–F7 remain owner decisions; neither set is part of this fix.
