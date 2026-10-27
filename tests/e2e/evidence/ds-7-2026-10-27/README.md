# DS-7 C1 visual evidence

Figma is on the left and the production-build app at 390×844 is on the right in each file under `pairs/`.

- `16-account-detail.jpg` — F1, Figma `29:2211`
- `18-reconcile-gap.jpg` — F2, Figma `30:2231`
- `19-reconcile-backfill.jpg` — F3, Figma `30:2258`
- `20-reconcile-remainder.jpg` — F4, Figma `30:2390`

The production E2E resets and seeds canonical test user A only. It preserves the C1 server contract: two saved rows update the Gap Bar from server truth, the remainder action verifies `adjustment` and `reconciled_at`, and a transaction-date gap is backfilled without touching owner data.
