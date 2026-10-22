# Honey R4 visual verification — 2026-10-23

Reference: `idea-forge/ideas/jodsa/docs/07-design.md`, “Visual language v6 — Honey”, and Figma file
`85YURQNppODPO2dFxD8O6W`, page `D — Honey · All screens` (`20:1071`). The written brief remains the
source of truth.

## Durable evidence

- `tests/e2e/honey-visual.spec.ts` fixes the viewport at 390×844, fixes the clock at 2026-10-22,
  removes only the development-only Next.js badge, and captures both Honey themes.
- `tests/e2e/honey-visual.spec.ts-snapshots/` contains 32 baselines: Home, transactions, accounts,
  budgets, invest, recurring, groups, import, sessions, more, settings, login, signup, and the add
  sheet in manual, transfer, and slip states (16 surfaces in light and dark).
- `tests/e2e/m9-contrast.spec.ts` checks the complete R0 token-pair table from computed browser styles
  in both themes.
- Final verification: visual + contrast E2E **31 passed**; TypeScript passed; unit suite **333 passed,
  34 live-RLS tests skipped**.

Representative visual comparison against the Figma board found the implemented shells aligned on the
load-bearing Honey language: warm canvas/card separation, chocolate hero, honey primary and selection,
blush-only destructive treatment, 28px page headings, 36px focal money, rounded segmented controls,
three-column account tiles, bottom-sheet add flow, and the text-only Honey auth mark. No schema or app
behaviour changed in R0–R4.

## Deliberate boundary

R4 can only baseline states that exist before the next OWNER-FB build slices. Figma frames whose behaviour
is not implemented yet remain deferred, not falsely marked verified: A3 payee/display name (screen 6), C2
invest/divest entry (screens 8–9), account reconcile entry and C1 flow (screens 16, 18–20), and the related
future transaction/detail states. Those frames must receive light/dark baselines when migration 0011 → A3 →
migration 0012 → C2 → C1 lands in the already-approved order.

