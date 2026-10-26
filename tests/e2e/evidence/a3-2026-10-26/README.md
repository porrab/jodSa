# OWNER-FB A3 visual evidence

Figma node `27:1357` is on the left; the built app at 390×844 is on the right.

- `pairs/06-add-manual-a3-full.jpg` — full frame.
- `pairs/06-add-manual-a3-focus.jpg` — payee + optional display-name region, including the live fallback helper.

The full-frame app capture comes from the production-build persistence E2E at 390×844. Its `beforeAll` resets and seeds only canonical test user A, then saves through the real UI after migration 0011 was applied and verified on live Supabase. The focused crop is the earlier field-state capture of the same implementation.

The persistence run covers expense and transfer create/edit/clear, including `note IS NULL` after pressing `ลบ`, plus rejection of 121 characters without a new row. `tests/unit/transaction-row-copy.test.ts` separately pins the title/meta fallback rules.
