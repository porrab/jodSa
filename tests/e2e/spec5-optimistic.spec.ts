import { test, expect, type Page, type Route } from '@playwright/test'
import { STORAGE_A } from './helpers/env'
import { env } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount, seedTransaction } from './helpers/admin'

/**
 * QA-SPEC5 — design v4 F6 (optimistic J1 save) + its SPEC5-1 rollback regression,
 * driven through the REAL UI on a live build. pm-desk (SPEC-5-review.md) issued
 * CHANGES NEEDED and required this E2E before SPEC-5 can close, because the
 * F6 evidence to date was 8 unit tests over a pure orchestrator + a single-field
 * browser self-check — structurally blind to the exact seam SPEC5-1 lived in.
 *
 * The forced-failure and delayed-success paths are produced by intercepting the
 * Next.js Server-Action POST (method POST to the current page URL) rather than by
 * killing the dev server the way the dev session did — so the run stays
 * deterministic and the provisional row (which React otherwise add+removes in one
 * commit) can actually be held on screen and asserted.
 */

const ACCOUNT_NAME = 'เงินสด'
// Substring of dashboard.pendingSave ("กำลังบันทึก…") — matched WITHOUT the trailing
// ellipsis so the assertion never hinges on the exact … codepoint. The provisional
// row is the ONLY "กำลังบันทึก" carrier on Home during an optimistic create (the
// blocking "saving" button never appears on this path), so the substring is unambiguous.
const PENDING_TEXT = 'กำลังบันทึก'
const SAVING_BTN = 'กำลังบันทึก...' // transaction.saving (three dots) — blocking path only
const QUICK_ADD_TITLE = 'บันทึกรายการ' // quickAdd.title (the global create sheet)
const EDIT_TITLE = 'รายการ' // transaction.title (the J3 detail/edit sheet)

test.use({ storageState: STORAGE_A })

let userId: string

test.beforeEach(async () => {
  const u = await findUserByEmail(env.userA.email)
  if (!u) throw new Error(`test user A missing: ${env.userA.email}`)
  userId = u.id
  await resetAllUserData(userId)
  await seedAccount(userId, ACCOUNT_NAME, 'KBank')
})

/**
 * Route the J1 create/update Server Action (POST to /dashboard). `delayMs` holds
 * the response open so the provisional row stays paintable; `abort` forces the
 * offline/rejected-write branch. When BOTH are given the delay is applied FIRST,
 * then the abort — so the optimistic close+reopen are separated in time and
 * observable (see the forced-failure test's gate). GET navigations + RSC
 * prefetches pass straight through.
 */
async function routeServerAction(
  page: Page,
  mode: { delayMs?: number; abort?: boolean },
): Promise<void> {
  const handler = async (route: Route) => {
    const req = route.request()
    const isAction = req.method() === 'POST' && !!req.headers()['next-action']
    if (isAction) {
      if (mode.delayMs) await new Promise((r) => setTimeout(r, mode.delayMs))
      if (mode.abort) {
        await route.abort('failed')
        return
      }
    }
    await route.continue()
  }
  await page.route((u) => u.pathname === '/dashboard', handler)
}

/** Open the quick-add sheet from Home's quick-add card, prefilled with an amount. */
async function openQuickAddWithAmount(page: Page, amount: string): Promise<void> {
  await page.getByLabel('จำนวนเงิน', { exact: true }).fill(amount) // card aria-label = quickAdd.amountLabel
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click() // quickAdd.save
  await expect(page.getByRole('heading', { name: QUICK_ADD_TITLE })).toBeVisible()
  await expect(page.getByLabel('จำนวนเงิน (บาท)')).toHaveValue(amount) // sheet amount = transaction.amount
}

test('SPEC5-F6 — optimistic save: provisional row paints subdued & not tappable, balance frozen, then resolves', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const focal = page.locator('.text-focal').first()
  const balanceBefore = (await focal.textContent())?.trim() ?? ''

  await routeServerAction(page, { delayMs: 3500 })
  await openQuickAddWithAmount(page, '42')

  // Submit the sheet. The optimistic path returns immediately, so the sheet must
  // close instantly — NOT sit on a "กำลังบันทึก..." blocking button.
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click() // transaction.save
  await expect(page.getByRole('heading', { name: QUICK_ADD_TITLE })).toBeHidden()

  // --- inside the in-flight window (action held open ~3.5s) ---
  const pendingRow = page.locator('.opacity-60').filter({ hasText: PENDING_TEXT })
  await expect(pendingRow).toBeVisible()
  await expect(pendingRow).toContainText(ACCOUNT_NAME) // preview label = account name (no counterparty)

  // Subdued: opacity 0.6 on the row container.
  const opacity = await pendingRow.evaluate((el) => getComputedStyle(el).opacity)
  expect(Number(opacity)).toBeCloseTo(0.6, 1)

  // NOT tappable: provisional row is a <div>, never a <button> (no record to open).
  expect(await pendingRow.evaluate((el) => el.tagName)).toBe('DIV')
  await expect(page.locator('button', { hasText: PENDING_TEXT })).toHaveCount(0)

  // v4 F6 rule 3 — balance is computed truth and must NOT move optimistically.
  expect((await focal.textContent())?.trim()).toBe(balanceBefore)

  // --- action resolves ---
  await expect(pendingRow).toHaveCount(0, { timeout: 15_000 })
  // The provisional row is replaced by a REAL, tappable row.
  const realRow = page.getByRole('button').filter({ hasText: ACCOUNT_NAME })
  await expect(realRow).toBeVisible()
  await expect(realRow).not.toContainText(PENDING_TEXT)
  // Now the server has confirmed, the balance is allowed to move.
  await expect(focal).not.toHaveText(balanceBefore)
})

test('SPEC5-1 — forced failure: row rolls back, error toast fires, sheet reopens with EVERY field intact (datetime included), balance frozen', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const focal = page.locator('.text-focal').first()
  const balanceBefore = (await focal.textContent())?.trim() ?? ''

  await openQuickAddWithAmount(page, '42')

  // Fill EVERY field the restore must carry back — especially datetime, the field
  // SPEC5-1 dropped. A fixed local value proves the value round-trips unchanged
  // (pre-fix it came back blank/UTC-shifted and, being `required`, unusable).
  const DT = '2026-07-15T13:45'
  await page.getByLabel('ผู้รับ / ผู้โอน').fill('ร้านทดสอบ QA') // counterparty
  await page.getByLabel('วันที่และเวลา').fill(DT) // datetime-local

  // Delay the write ~800ms THEN abort. The delay is what makes the anti-false-pass
  // gate observable: on the optimistic path the sheet closes instantly and stays
  // closed for the whole ~800ms window before onFailure re-opens it, so `toBeHidden`
  // reliably catches the closed state. On the OLD blocking path the sheet would sit
  // OPEN on a disabled "saving" button for that same window and never go hidden —
  // so this gate still fails RED on the regression it guards. (A zero-delay abort
  // let React batch the close+reopen into one commit, hiding the closed frame and
  // false-failing a correct fix — QA-SPEC5-1 root-cause.)
  await routeServerAction(page, { delayMs: 800, abort: true })
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()

  // ANTI-FALSE-PASS GATE (design v4 F6): the optimistic path closes the sheet
  // IMMEDIATELY on submit, then re-opens it via onFailure=restore. If instead the
  // save BLOCKS (the sheet is held open on a disabled "saving" button until the
  // write settles), then on an aborted write the sheet never closes at all and its
  // inputs merely retain what was typed — which would let every field assertion
  // below pass WITHOUT the F6 rollback path ever running. This gate fails in that
  // case: on the optimistic path the sheet is hidden for the ~800ms delay window
  // between the instant close and the restore re-open.
  await expect(page.getByRole('heading', { name: QUICK_ADD_TITLE })).toBeHidden({ timeout: 2000 })

  // Failure must be loud.
  await expect(page.locator('[data-sonner-toast]')).toBeVisible()

  // Sheet reopens (F6 rule 4).
  await expect(page.getByRole('heading', { name: QUICK_ADD_TITLE })).toBeVisible({ timeout: 4000 })

  // Every field intact.
  await expect(page.getByLabel('จำนวนเงิน (บาท)')).toHaveValue('42')
  await expect(page.getByLabel('ผู้รับ / ผู้โอน')).toHaveValue('ร้านทดสอบ QA')

  // THE SPEC5-1 assertion — datetime non-empty, exactly what was typed, and a
  // value the control actually accepts.
  const dt = page.getByLabel('วันที่และเวลา')
  await expect(dt).toHaveValue(DT)
  expect(await dt.evaluate((el) => (el as HTMLInputElement).value)).not.toBe('')
  expect(await dt.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(true)

  // Provisional row rolled back → back to the empty state; nothing saved.
  await expect(page.locator('.opacity-60').filter({ hasText: PENDING_TEXT })).toHaveCount(0)
  await expect(page.getByText('ยังไม่มีรายการวันนี้')).toBeVisible() // noTransactionsToday

  // Balance never moved.
  expect((await focal.textContent())?.trim()).toBe(balanceBefore)
})

test('SPEC5-scope — editing an existing transaction still BLOCKS (no optimism): sheet stays open on a disabled saving button, no provisional row', async ({
  page,
}) => {
  const acctId = await seedAccount(userId, 'ออมทรัพย์', 'SCB')
  await seedTransaction(userId, acctId, {
    type: 'expense',
    amountSatang: 5_000,
    counterparty: 'ร้านเดิม QA',
    datetime: new Date().toISOString(),
  })

  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  // Open the row → detail sheet → edit form. EDIT_TITLE is matched EXACTLY:
  // a substring match would also hit the "รายการวันนี้" list heading.
  await page.getByRole('button').filter({ hasText: 'ร้านเดิม QA' }).click()
  await expect(page.getByRole('heading', { name: EDIT_TITLE, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click() // transaction.edit
  await expect(page.getByLabel('จำนวนเงิน (บาท)')).toHaveValue('50.00')

  await routeServerAction(page, { delayMs: 3000 })
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()

  // Blocking signature: the submit button enters the disabled "saving" state and
  // the sheet STAYS open — the optimistic create path never shows either (it
  // closes instantly). This is the behavioral proof edit is off the F6 path.
  const savingBtn = page.getByRole('button', { name: SAVING_BTN })
  await expect(savingBtn).toBeVisible()
  await expect(savingBtn).toBeDisabled()
  await expect(page.getByRole('heading', { name: EDIT_TITLE, exact: true })).toBeVisible()
  // No provisional row on Home while an EDIT is in flight (the pending ROW is an
  // opacity-60 div; the blocking "saving" button legitimately carries the same
  // base word, so match the row specifically, not the bare text).
  await expect(page.locator('.opacity-60').filter({ hasText: PENDING_TEXT })).toHaveCount(0)

  // Resolves normally, sheet closes.
  await expect(page.getByRole('heading', { name: EDIT_TITLE, exact: true })).toBeHidden({ timeout: 15_000 })
})
