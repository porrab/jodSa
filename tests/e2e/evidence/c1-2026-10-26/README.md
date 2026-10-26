# OWNER-FB C1 visual evidence

Figma is on the left and the production-build app at 390×844 is on the right in each file under `pairs/`.

- `16-account-detail.jpg` — Figma `29:2211`
- `18-reconcile-gap.jpg` — Figma `30:2231`
- `19-reconcile-backfill.jpg` — Figma `30:2258`
- `20-reconcile-remainder.jpg` — Figma `30:2390`

The app journey resets and seeds only canonical test user A. It saves ฿60 and ฿47 missing expenses, waits for each server-confirmed balance before moving the Gap Bar from ฿412 → ฿352 → ฿305, then records the remainder as the `adjustment` system category and verifies `reconciled_at`. It finishes through the second C1 entry point on `/transactions`: a detected missing-day hint opens the continuous backfill sheet with the gap date preset, saves ฿12.34, and verifies that date in the database.
