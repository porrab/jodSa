# OWNER-FB A3 visual evidence

Figma node `27:1357` is on the left; the built app at 390×844 is on the right.

- `pairs/06-add-manual-a3-full.jpg` — full frame.
- `pairs/06-add-manual-a3-focus.jpg` — payee + optional display-name region, including the live fallback helper.

The app capture used the existing test-user storage state through `playwright.readonly.config.ts`. The A3 spec did not reset, seed, submit, or otherwise mutate the configured Supabase project. Migration 0011 was validated separately against an ephemeral PGlite database and was not applied to Supabase.

The persisted Tx Row rule is covered without a live schema write by `tests/unit/transaction-row-copy.test.ts`: note becomes the title; non-title category/payee stay in metadata; payee is not repeated when it is the title; transfer notes replace the destination title.
