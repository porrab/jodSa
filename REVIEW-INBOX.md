# REVIEW-INBOX

Correction briefs from pm-desk. Newest on top.
Dev session: work through OPEN items, mark each `[x]` and note what was done, then ask pm-desk for a re-review.

---

## [M1] CHANGES NEEDED — 2026-06-05
**From**: pm-desk
**Status**: OPEN

### Items

- [ ] **(id: M1-1)** `tests/unit/rls.test.ts` passes `user_id: ''` on INSERT — will fail when credentials are set up. **Why:** RLS `WITH CHECK` validates the value you provide; it does not inject it. `''` is not a valid UUID. **Fixed =** `beforeAll` calls `await clientA.auth.getUser()` (and `clientB`) after signIn and passes the real `user.id` on every INSERT — same pattern as `app/actions/accounts.ts:20`.

- [ ] **(id: M1-2)** RLS integration test must actually run and pass — currently always skipped. **Why:** Acceptance criterion says "automated RLS check." Skipped ≠ passing. **Fixed =** `.env.test` (gitignored) created with `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_USER_A_EMAIL/PASS`, `TEST_USER_B_EMAIL/PASS`. `DOTENV_CONFIG_PATH=.env.test pnpm test tests/unit/rls.test.ts` exits green. Paste the test output as re-review evidence.

- [ ] **(id: M1-3)** Manual "second device" smoke test not yet done. **Why:** AC3 requires it; architecture being correct is not sufficient evidence. **Fixed =** Log in as the same user in two browser windows; add a transaction in one; confirm it appears (after refresh) in the other.

- [ ] **(id: M1-4)** `"recharts": "latest"` in `package.json` — not pinned. **Why:** `latest` pulls whatever the registry has on next install; for M5 bundle analysis this is non-reproducible. Low severity but production-grade discipline. **Fixed =** Change to `"recharts": "^3.8.1"` (or the version in your lock file).

### Dev notes
Strong points that don't need changes: schema + RLS SQL correct, no Drizzle on request paths (confirmed by grep), `computeAccountBalance` formula correct + hand fixture passes, Zod discriminated union for transactions. Fix the 4 items above and request re-review.
