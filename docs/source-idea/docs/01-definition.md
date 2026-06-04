# 01 — Project Definition

## One-line
A low-friction personal finance tracking PWA that auto-reads Thai bank slips and tracks budgets.

## Primary user & job-to-be-done
General users in Thailand, starting with the builder. They want to log **income / expense / money-transfer** in detail (day / month / year) **without typing much**, so they can analyze where to cut or grow and save/invest more. The core friction it removes: instead of jotting everything down during the day or all at once at night (and forgetting), the user shares a slip image and the app fills in the transaction.

It is a **portfolio piece intended for real use by others** — multi-tenant, each user's data fully isolated.

## Success criteria
1. Log one item from a slip in **< 10 seconds** (share → auto-filled form → confirm).
2. Read the **amount** off a Thai slip correctly **≥ 90%** of the time (always editable).
3. A new user signs up and logs their first item in **< 2 minutes**, with **zero server-side cost** for slip reading.
4. Set a monthly budget and immediately see **+/- vs. real spend**.
5. Open on phone and PC and see the **same data** (sync-on-load).

## Explicit non-goals
- ❌ No bank-API / statement auto-pull — slips only.
- ❌ No real-time / live collaborative sync in MVP (sync-on-load only; live sync is Phase 2).
- ❌ No paid server-side AI vision in MVP (free, client-side parsing only).
- ❌ No multi-currency — **THB only**.
- ❌ Not an investment / trading app — track + light analysis only.
- ❌ Do **not** store slip images — parse then discard.
- ❌ Not offline-capable — online-only, installable shell, **no offline write queue**.
- ❌ Guest payments are **RECORDED, not VERIFIED** — no bank verification API; host manually confirms/unconfirms.

## Scope summary
- **Locale:** THB only; UI Thai/English; light/dark theme.
- **MVP core (3 things):** (1) three log types [income, expense, transfer], (2) AI slip reading (QR + free OCR, client-side), (3) budgets/goals with +/- tracking.
- **Also in MVP:** multi-bank accounts, recurring/subscription expenses with per-weekday exclusions, grouped expenses (trips), guest group-payment sessions, PWA share target.
- **Deferred to Phase 2:** real-time live sync, Line OA image send, BYO vision API key, CSV export, cron notifications.

## Naming
- Project name: **JodSa** ("จด" = to record — the core action). Slug: `jodsa`. Mascot/icon to be designed by the owner later.
